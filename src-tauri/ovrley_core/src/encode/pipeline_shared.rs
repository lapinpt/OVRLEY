//! Shared internal runtime helpers for encode pipelines.
//!
//! This module owns only the pieces that are common across transparent and
//! composite encoding at the runtime-infrastructure layer: queue buffer
//! payloads, buffer reuse, writer lifecycle helpers, and timing-map
//! aggregation. Pipeline-specific ffmpeg spawning, stderr monitoring, render
//! loops, and progress math stay in their owning pipeline modules.
//!
//! The shared writer helpers are deliberately compatibility-oriented rather
//! than "line-for-line duplicate" moves. Two important differences were aligned
//! before sharing code:
//!
//! - Transparent and composite writers both count written frames as `u64`.
//! - Writer cancellation policy is explicit: transparent stops on cancel,
//!   while composite keeps draining until the sender closes.
//! - This module stays `pub(crate)` so the transparent pipeline does not gain
//!   wider visibility during the extraction.

use std::collections::BTreeMap;
use std::io::Write;
use std::ops::{Deref, DerefMut};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ExitStatus};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, SyncSender, TrySendError};
use std::sync::Arc;
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::debug::{RenderProfiler, TimingBucket};
use crate::error::{CoreError, CoreResult};

const WRITER_DRAIN_TIMEOUT: Duration = Duration::from_secs(5);
const FFMPEG_FINALIZE_TIMEOUT: Duration = Duration::from_secs(30);
const FFMPEG_TERMINATE_TIMEOUT: Duration = Duration::from_secs(2);
const SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// Reusable raw RGBA frame buffer exchanged through the encode queues.
pub(crate) struct FrameBuffer {
    /// Pixel bytes in row-major RGBA order.
    pub(crate) pixels: Vec<u8>,
}

/// Removes an incomplete encoder output unless explicitly preserved.
pub(crate) struct PartialOutputGuard {
    path: PathBuf,
    preserve: bool,
}

impl PartialOutputGuard {
    pub(crate) fn new(path: &Path) -> Self {
        Self {
            path: path.to_path_buf(),
            preserve: false,
        }
    }

    pub(crate) fn preserve(&mut self) {
        self.preserve = true;
    }
}

impl Drop for PartialOutputGuard {
    fn drop(&mut self) {
        if self.preserve {
            return;
        }
        if let Err(error) = std::fs::remove_file(&self.path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!(
                    "Could not remove incomplete encoder output {}: {error}",
                    self.path.display()
                );
            }
        }
    }
}

/// Owns an FFmpeg child and prevents early-return process leaks.
pub(crate) struct FfmpegChildGuard {
    child: Child,
    process_name: &'static str,
}

impl FfmpegChildGuard {
    pub(crate) fn new(child: Child, process_name: &'static str) -> Self {
        Self {
            child,
            process_name,
        }
    }
}

impl Deref for FfmpegChildGuard {
    type Target = Child;

    fn deref(&self) -> &Self::Target {
        &self.child
    }
}

impl DerefMut for FfmpegChildGuard {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.child
    }
}

impl Drop for FfmpegChildGuard {
    fn drop(&mut self) {
        match self.child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => {}
            Err(error) => {
                log::warn!(
                    "Could not inspect {} ffmpeg during cleanup: {error}",
                    self.process_name
                );
            }
        }
        if let Err(error) = self.child.kill() {
            log::warn!(
                "Could not terminate leaked {} ffmpeg process: {error}",
                self.process_name
            );
            return;
        }
        match poll_child_exit(&mut self.child, FFMPEG_TERMINATE_TIMEOUT, self.process_name) {
            Ok(Some(_)) => {}
            Ok(None) => log::warn!(
                "{} ffmpeg process did not exit during cleanup",
                self.process_name
            ),
            Err(error) => log::warn!(
                "Could not reap {} ffmpeg process during cleanup: {error}",
                self.process_name
            ),
        }
    }
}

/// Explicit writer-thread cancellation behavior for shared encode helpers.
pub(crate) enum WriterCancellation {
    /// Stop consuming queued frames once the shared cancel flag is raised.
    StopWhenCancelled(Arc<AtomicBool>),
    /// Continue draining queued frames until the frame sender is dropped.
    DrainUntilQueueCloses,
}

impl WriterCancellation {
    /// Returns whether the writer should stop before writing another frame.
    pub(crate) fn should_stop(&self) -> bool {
        match self {
            Self::StopWhenCancelled(cancel_flag) => cancel_flag.load(Ordering::SeqCst),
            Self::DrainUntilQueueCloses => false,
        }
    }
}

/// Result returned by the shared ffmpeg stdin writer thread.
pub(crate) struct WriterResult {
    /// Number of complete frames written into ffmpeg stdin.
    pub(crate) written_frames: u64,
    /// Writer-side timing buckets collected while draining the queue.
    pub(crate) timings: BTreeMap<String, TimingBucket>,
}

/// Pipeline-specific writer behavior that stays configurable after extraction.
pub(crate) struct WriterWorkerConfig<'a> {
    /// Raised before returning any writer failure so producers stop queueing.
    pub(crate) pipeline_failed: Arc<AtomicBool>,
    /// Whether the writer stops early on cancellation or drains until EOF.
    pub(crate) cancellation: WriterCancellation,
    /// Prefix used when turning `write_all` failures into `CoreError::Encode`.
    pub(crate) write_error_context: &'a str,
    /// Optional timing bucket for queue receive wait time.
    pub(crate) queue_wait_metric: Option<&'a str>,
    /// Optional timing bucket for free-buffer return wait time.
    pub(crate) release_wait_metric: Option<&'a str>,
    /// Optional encode error raised when the free-buffer pool disconnects.
    pub(crate) release_error_message: Option<&'a str>,
    /// Whether a final stdin flush failure should fail the render.
    pub(crate) flush_error_is_fatal: bool,
}

/// Merges timing buckets recorded on separate render and writer threads.
pub(crate) fn merge_timing_maps(
    mut left: BTreeMap<String, TimingBucket>,
    right: BTreeMap<String, TimingBucket>,
) -> BTreeMap<String, TimingBucket> {
    // Combine render-thread and writer-thread buckets for one summary file.
    for (name, bucket) in right {
        let entry = left.entry(name).or_default();
        entry.count += bucket.count;
        entry.total_ms += bucket.total_ms;
        entry.avg_ms = if entry.count == 0 {
            0.0
        } else {
            entry.total_ms / f64::from(entry.count)
        };
        entry.max_ms = entry.max_ms.max(bucket.max_ms);
    }
    left
}

/// Sends a completed frame to the writer thread while respecting cancellation.
pub(crate) fn queue_frame(
    sender: &SyncSender<FrameBuffer>,
    frame_buffer: FrameBuffer,
    cancel_flag: &AtomicBool,
    pipeline_failed: &AtomicBool,
    profiler: &mut RenderProfiler,
) -> CoreResult<()> {
    // `try_send` lets the render loop poll cancellation while backpressure
    // clears, instead of blocking indefinitely inside `send`.
    let started = Instant::now();
    let mut payload = frame_buffer;
    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(CoreError::Cancelled);
        }
        if pipeline_failed.load(Ordering::SeqCst) {
            return Err(CoreError::Encode("Encoder writer failed".to_string()));
        }
        match sender.try_send(payload) {
            Ok(()) => {
                profiler.record_ms("queue.put_wait", started.elapsed().as_secs_f64() * 1000.0);
                return Ok(());
            }
            Err(TrySendError::Full(returned_payload)) => {
                payload = returned_payload;
                thread::sleep(Duration::from_millis(10));
            }
            Err(TrySendError::Disconnected(_)) => {
                return Err(CoreError::Encode("Encoder queue disconnected".to_string()));
            }
        }
    }
}

/// Writes queued frame buffers into ffmpeg stdin and returns buffers to the pool.
pub(crate) fn writer_worker(
    stdin: ChildStdin,
    receiver: Receiver<FrameBuffer>,
    free_sender: SyncSender<FrameBuffer>,
    config: WriterWorkerConfig<'_>,
) -> CoreResult<WriterResult> {
    let pipeline_failed = Arc::clone(&config.pipeline_failed);
    // Keep the pool sender alive until the failure flag is published. Otherwise
    // workers can observe a disconnected pool in the brief interval between
    // `writer_worker_inner` dropping the sender and this wrapper setting the
    // flag, which hides the writer's actual FFmpeg error.
    let result = writer_worker_inner(stdin, receiver, &free_sender, config);
    if result.is_err() {
        pipeline_failed.store(true, Ordering::SeqCst);
    }
    result
}

fn writer_worker_inner(
    mut stdin: ChildStdin,
    receiver: Receiver<FrameBuffer>,
    free_sender: &SyncSender<FrameBuffer>,
    config: WriterWorkerConfig<'_>,
) -> CoreResult<WriterResult> {
    // The writer owns ffmpeg stdin. It returns buffers to the free pool after a
    // successful write so the renderer can reuse allocations across frames.
    let mut profiler = RenderProfiler::default();
    let mut written_frames = 0u64;
    loop {
        let queue_started = Instant::now();
        let frame = match receiver.recv() {
            Ok(frame) => {
                record_optional_metric(&mut profiler, config.queue_wait_metric, queue_started);
                frame
            }
            Err(_) => {
                record_optional_metric(&mut profiler, config.queue_wait_metric, queue_started);
                break;
            }
        };
        if config.cancellation.should_stop() {
            break;
        }
        let write_started = Instant::now();
        stdin.write_all(frame.pixels.as_slice()).map_err(|error| {
            CoreError::Encode(format!("{}: {error}", config.write_error_context))
        })?;
        profiler.record_ms(
            "ffmpeg.write",
            write_started.elapsed().as_secs_f64() * 1000.0,
        );
        written_frames += 1;

        let release_started = Instant::now();
        let release_result = free_sender.send(frame);
        record_optional_metric(&mut profiler, config.release_wait_metric, release_started);
        match (release_result, config.release_error_message) {
            (Ok(()), _) => {}
            (Err(_), Some(message)) => {
                return Err(CoreError::Encode(message.to_string()));
            }
            (Err(_), None) => {}
        }
    }

    let flush_result = stdin
        .flush()
        .map_err(|error| CoreError::Encode(error.to_string()));
    if config.flush_error_is_fatal {
        flush_result?;
    }

    Ok(WriterResult {
        written_frames,
        timings: profiler.summary(),
    })
}

/// Computes the byte length of one tightly packed RGBA frame.
pub(crate) fn checked_rgba_frame_len(width: u32, height: u32) -> CoreResult<usize> {
    let pixel_count = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| {
            CoreError::Encode(format!("RGBA frame dimensions overflow: {width}x{height}"))
        })?;
    pixel_count.checked_mul(4).ok_or_else(|| {
        CoreError::Encode(format!("RGBA frame byte length overflow: {width}x{height}"))
    })
}

/// Gives a writer a bounded opportunity to close FFmpeg stdin.
///
/// A stalled pipe write is unblocked by terminating FFmpeg. The caller still
/// owns and joins the writer handle after this function returns.
pub(crate) fn unblock_stalled_writer<T>(
    writer: &JoinHandle<T>,
    child: &mut Child,
    process_name: &str,
    cancel_flag: &AtomicBool,
) -> CoreResult<bool> {
    let deadline = Instant::now() + WRITER_DRAIN_TIMEOUT;
    while !writer.is_finished() && Instant::now() < deadline {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = terminate_ffmpeg(child, process_name)?;
            if wait_for_thread(writer, FFMPEG_TERMINATE_TIMEOUT) {
                return Ok(true);
            }
            return Err(CoreError::Encode(format!(
                "{process_name} encoder writer did not stop after cancellation"
            )));
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }
    if writer.is_finished() {
        return Ok(false);
    }

    let _ = terminate_ffmpeg(child, process_name)?;
    if wait_for_thread(writer, FFMPEG_TERMINATE_TIMEOUT) {
        return Err(CoreError::Encode(format!(
            "{process_name} ffmpeg did not drain stdin within {} seconds and was terminated",
            WRITER_DRAIN_TIMEOUT.as_secs()
        )));
    }

    Err(CoreError::Encode(format!(
        "{process_name} encoder writer did not stop after ffmpeg termination"
    )))
}

/// Waits a bounded time for FFmpeg finalization while observing cancellation.
pub(crate) fn wait_for_ffmpeg(
    child: &mut Child,
    process_name: &str,
    cancel_flag: &AtomicBool,
) -> CoreResult<(ExitStatus, bool)> {
    let deadline = Instant::now() + FFMPEG_FINALIZE_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            CoreError::Encode(format!("{process_name} ffmpeg process error: {error}"))
        })? {
            return Ok((status, cancel_flag.load(Ordering::SeqCst)));
        }
        if cancel_flag.load(Ordering::SeqCst) {
            return terminate_ffmpeg(child, process_name).map(|status| (status, true));
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }

    let _ = terminate_ffmpeg(child, process_name)?;
    Err(CoreError::Encode(format!(
        "{process_name} ffmpeg did not finalize within {} seconds and was terminated",
        FFMPEG_FINALIZE_TIMEOUT.as_secs()
    )))
}

/// Immediately terminates FFmpeg and waits a bounded time for it to exit.
pub(crate) fn terminate_ffmpeg(child: &mut Child, process_name: &str) -> CoreResult<ExitStatus> {
    if let Some(status) = child.try_wait().map_err(|error| {
        CoreError::Encode(format!("{process_name} ffmpeg process error: {error}"))
    })? {
        return Ok(status);
    }
    child.kill().map_err(|error| {
        CoreError::Encode(format!(
            "Failed to terminate {process_name} ffmpeg: {error}"
        ))
    })?;
    poll_child_exit(child, FFMPEG_TERMINATE_TIMEOUT, process_name)?.ok_or_else(|| {
        CoreError::Encode(format!(
            "{process_name} ffmpeg did not exit after forced termination"
        ))
    })
}

/// Joins an encoder-owned thread without allowing teardown to block forever.
pub(crate) fn join_shutdown_thread<T>(handle: JoinHandle<T>, thread_name: &str) -> CoreResult<T> {
    if !wait_for_thread(&handle, FFMPEG_TERMINATE_TIMEOUT) {
        return Err(CoreError::Encode(format!(
            "{thread_name} did not stop within {} seconds of encoder shutdown",
            FFMPEG_TERMINATE_TIMEOUT.as_secs()
        )));
    }
    handle
        .join()
        .map_err(|_| CoreError::Encode(format!("{thread_name} panicked")))
}

fn wait_for_thread<T>(handle: &JoinHandle<T>, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while !handle.is_finished() && Instant::now() < deadline {
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }
    handle.is_finished()
}

fn poll_child_exit(
    child: &mut Child,
    timeout: Duration,
    process_name: &str,
) -> CoreResult<Option<ExitStatus>> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            CoreError::Encode(format!("{process_name} ffmpeg process error: {error}"))
        })? {
            return Ok(Some(status));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }
}

/// Records a timing bucket only when the owning pipeline requested it.
fn record_optional_metric(
    profiler: &mut RenderProfiler,
    metric_name: Option<&str>,
    started: Instant,
) {
    if let Some(metric_name) = metric_name {
        profiler.record_ms(metric_name, started.elapsed().as_secs_f64() * 1000.0);
    }
}

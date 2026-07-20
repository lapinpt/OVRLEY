//! Shared FFmpeg process lifecycle and pipeline teardown.

use std::ops::{Deref, DerefMut};
use std::path::{Path, PathBuf};
use std::process::{Child, ExitStatus};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::error::{CoreError, CoreResult};

use super::queue::WriterResult;

const WRITER_DRAIN_TIMEOUT: Duration = Duration::from_secs(5);
const FFMPEG_FINALIZE_TIMEOUT: Duration = Duration::from_secs(30);
const FFMPEG_TERMINATE_TIMEOUT: Duration = Duration::from_secs(2);
const SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(25);

#[derive(Clone, Copy)]
pub(crate) enum PipelineKind {
    Transparent,
    Composite,
}

impl std::fmt::Display for PipelineKind {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Transparent => "transparent",
            Self::Composite => "composite",
        })
    }
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
    pipeline: PipelineKind,
}

impl FfmpegChildGuard {
    pub(crate) fn new(child: Child, pipeline: PipelineKind) -> Self {
        Self { child, pipeline }
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
                    self.pipeline
                );
            }
        }
        if let Err(error) = self.child.kill() {
            log::warn!(
                "Could not terminate leaked {} ffmpeg process: {error}",
                self.pipeline
            );
            return;
        }
        match poll_child_exit(&mut self.child, FFMPEG_TERMINATE_TIMEOUT, self.pipeline) {
            Ok(Some(_)) => {}
            Ok(None) => log::warn!(
                "{} ffmpeg process did not exit during cleanup",
                self.pipeline
            ),
            Err(error) => log::warn!(
                "Could not reap {} ffmpeg process during cleanup: {error}",
                self.pipeline
            ),
        }
    }
}

/// Mode-specific diagnostic formatting for the shared FFmpeg lifecycle.
pub(crate) trait PipelineFailurePolicy {
    fn writer_failure(&self, error: CoreError, status: Option<ExitStatus>) -> CoreError;
    fn ffmpeg_failure(&self, status: ExitStatus) -> CoreError;
}

/// Successful producer, writer, and FFmpeg results after canonical teardown.
pub(crate) struct PipelineOutcome<T> {
    pub(crate) producer: T,
    pub(crate) writer: WriterResult,
}

/// Drains the writer and resolves cancellation, producer, writer, monitor, and
/// FFmpeg results in one canonical order for every encode mode.
pub(crate) fn finalize_pipeline<T, P: PipelineFailurePolicy>(
    child: &mut Child,
    writer_thread: JoinHandle<CoreResult<WriterResult>>,
    monitor_thread: JoinHandle<()>,
    producer_result: CoreResult<T>,
    cancel_flag: &AtomicBool,
    pipeline_failed: &AtomicBool,
    pipeline: PipelineKind,
    failure_policy: &P,
) -> CoreResult<PipelineOutcome<T>> {
    let (writer_thread_name, monitor_thread_name) = match pipeline {
        PipelineKind::Transparent => ("Encoder writer thread", "FFmpeg monitor thread"),
        PipelineKind::Composite => (
            "Composite encoder writer thread",
            "Composite ffmpeg monitor thread",
        ),
    };
    let mut was_cancelled = cancel_flag.load(Ordering::SeqCst);
    let producer_failed = producer_result.is_err();
    let writer_failed_before_teardown = pipeline_failed.load(Ordering::SeqCst);
    let mut shutdown_error = None;
    let mut status = None;

    if was_cancelled || producer_failed || writer_failed_before_teardown {
        match terminate_ffmpeg(child, pipeline) {
            Ok(exit_status) => status = Some(exit_status),
            Err(error) => shutdown_error = Some(error),
        }
    } else {
        match unblock_stalled_writer(&writer_thread, child, pipeline, cancel_flag) {
            Ok(cancelled) => was_cancelled |= cancelled,
            Err(error) => shutdown_error = Some(error),
        }
    }

    let writer_result = join_shutdown_thread(writer_thread, writer_thread_name);
    if status.is_none()
        && shutdown_error.is_none()
        && !was_cancelled
        && !producer_failed
        && !writer_failed_before_teardown
    {
        match wait_for_ffmpeg(child, pipeline, cancel_flag) {
            Ok((exit_status, cancelled)) => {
                status = Some(exit_status);
                was_cancelled |= cancelled;
            }
            Err(error) => shutdown_error = Some(error),
        }
    }
    let monitor_result = join_shutdown_thread(monitor_thread, monitor_thread_name);

    if was_cancelled {
        return Err(CoreError::Cancelled);
    }
    let writer_result = match writer_result {
        Ok(result) => result,
        Err(error) => {
            if !writer_failed_before_teardown {
                if let Err(producer_error) = producer_result {
                    return Err(producer_error);
                }
            }
            return Err(error);
        }
    };
    if writer_failed_before_teardown {
        let error = writer_result.err().unwrap_or_else(|| {
            CoreError::Encode(format!(
                "{pipeline} encoder writer stopped without reporting its failure"
            ))
        });
        return Err(failure_policy.writer_failure(error, status));
    }
    let producer = producer_result?;
    if let Some(error) = shutdown_error {
        return Err(error);
    }
    monitor_result?;
    let status = status.ok_or_else(|| {
        CoreError::Encode(format!("{pipeline} ffmpeg did not report an exit status"))
    })?;
    let writer =
        writer_result.map_err(|error| failure_policy.writer_failure(error, Some(status)))?;
    if !status.success() {
        return Err(failure_policy.ffmpeg_failure(status));
    }

    Ok(PipelineOutcome { producer, writer })
}

/// Gives a writer a bounded opportunity to close FFmpeg stdin.
///
/// A stalled pipe write is unblocked by terminating FFmpeg. The caller still
/// owns and joins the writer handle after this function returns.
pub(crate) fn unblock_stalled_writer<T>(
    writer: &JoinHandle<T>,
    child: &mut Child,
    pipeline: PipelineKind,
    cancel_flag: &AtomicBool,
) -> CoreResult<bool> {
    let deadline = Instant::now() + WRITER_DRAIN_TIMEOUT;
    while !writer.is_finished() && Instant::now() < deadline {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = terminate_ffmpeg(child, pipeline)?;
            if wait_for_thread(writer, FFMPEG_TERMINATE_TIMEOUT) {
                return Ok(true);
            }
            return Err(CoreError::Encode(format!(
                "{pipeline} encoder writer did not stop after cancellation"
            )));
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }
    if writer.is_finished() {
        return Ok(false);
    }

    let _ = terminate_ffmpeg(child, pipeline)?;
    if wait_for_thread(writer, FFMPEG_TERMINATE_TIMEOUT) {
        return Err(CoreError::Encode(format!(
            "{pipeline} ffmpeg did not drain stdin within {} seconds and was terminated",
            WRITER_DRAIN_TIMEOUT.as_secs()
        )));
    }

    Err(CoreError::Encode(format!(
        "{pipeline} encoder writer did not stop after ffmpeg termination"
    )))
}

/// Waits a bounded time for FFmpeg finalization while observing cancellation.
pub(crate) fn wait_for_ffmpeg(
    child: &mut Child,
    pipeline: PipelineKind,
    cancel_flag: &AtomicBool,
) -> CoreResult<(ExitStatus, bool)> {
    let deadline = Instant::now() + FFMPEG_FINALIZE_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            CoreError::Encode(format!("{pipeline} ffmpeg process error: {error}"))
        })? {
            return Ok((status, cancel_flag.load(Ordering::SeqCst)));
        }
        if cancel_flag.load(Ordering::SeqCst) {
            return terminate_ffmpeg(child, pipeline).map(|status| (status, true));
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }

    let _ = terminate_ffmpeg(child, pipeline)?;
    Err(CoreError::Encode(format!(
        "{pipeline} ffmpeg did not finalize within {} seconds and was terminated",
        FFMPEG_FINALIZE_TIMEOUT.as_secs()
    )))
}

/// Immediately terminates FFmpeg and waits a bounded time for it to exit.
pub(crate) fn terminate_ffmpeg(
    child: &mut Child,
    pipeline: PipelineKind,
) -> CoreResult<ExitStatus> {
    if let Some(status) = child
        .try_wait()
        .map_err(|error| CoreError::Encode(format!("{pipeline} ffmpeg process error: {error}")))?
    {
        return Ok(status);
    }
    child.kill().map_err(|error| {
        CoreError::Encode(format!("Failed to terminate {pipeline} ffmpeg: {error}"))
    })?;
    poll_child_exit(child, FFMPEG_TERMINATE_TIMEOUT, pipeline)?.ok_or_else(|| {
        CoreError::Encode(format!(
            "{pipeline} ffmpeg did not exit after forced termination"
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
    pipeline: PipelineKind,
) -> CoreResult<Option<ExitStatus>> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            CoreError::Encode(format!("{pipeline} ffmpeg process error: {error}"))
        })? {
            return Ok(Some(status));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }
}

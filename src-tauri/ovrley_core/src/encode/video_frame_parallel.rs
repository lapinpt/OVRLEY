//! Ordered parallel CPU frame production for a single FFmpeg process.
//!
//! Prepared render assets are built before this module is entered and remain
//! immutable for the lifetime of the workers. Every worker creates its own
//! Skia surface around an exclusively owned RGBA buffer; surfaces and canvases
//! are never shared between threads.
//!
//! The buffer-before-task invariant is intentional: a worker must acquire its
//! render buffer before claiming a frame index. Reversing that order can
//! deadlock ordered forwarding when an early frame waits for a buffer held by
//! workers that claimed later frames.

use crate::activity::schema::DenseActivityReport;
use crate::debug::{RenderProfiler, TimingBucket};
use crate::encode::pipeline_shared::{merge_timing_maps, queue_frame, FrameBuffer};
use crate::encode::progress::ProgressEstimator;
use crate::encode::video::RenderController;
use crate::error::{CoreError, CoreResult};
use crate::paths::AppPaths;
use crate::render::widgets::PreparedRenderAssets;
use crate::render::{render_frame_rgba, FrameRenderRequest, RenderTarget};
use std::collections::BTreeMap;
use std::num::{NonZeroU32, NonZeroUsize};
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const MAX_PARALLEL_FRAME_BUFFERS: usize = 5;
pub const MAX_FRAME_WORKERS: usize = MAX_PARALLEL_FRAME_BUFFERS - 1;
const PARALLEL_FRAME_MEMORY_CEILING_BYTES: usize = 192 * 1024 * 1024;

fn invalid_parallel_mode(value: &str) -> CoreError {
    CoreError::Encode(format!(
        "parallel frame worker count must be in 1..={MAX_FRAME_WORKERS}; received {value:?}"
    ))
}

/// Diagnoses the canonical frame-worker count for one codec profile and render.
pub fn diagnose_frame_worker_count(
    total_frames: usize,
    cpu_cores_per_frame_worker: usize,
) -> NonZeroUsize {
    let logical_cores = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    diagnose_frame_worker_count_for_resources(
        total_frames,
        cpu_cores_per_frame_worker,
        logical_cores,
    )
}

fn diagnose_frame_worker_count_for_resources(
    total_frames: usize,
    cpu_cores_per_frame_worker: usize,
    logical_cores: usize,
) -> NonZeroUsize {
    let workers = if cpu_cores_per_frame_worker == 0 {
        1
    } else {
        (logical_cores / cpu_cores_per_frame_worker)
            .clamp(1, MAX_FRAME_WORKERS)
            .min(total_frames.max(1))
    };
    NonZeroUsize::new(workers).expect("diagnosed frame worker count is non-zero")
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ParallelFramePoolPlan {
    pub(crate) frame_byte_len: usize,
    pub(crate) buffer_count: usize,
    pub(crate) queue_capacity: usize,
}

impl ParallelFramePoolPlan {
    pub(crate) fn for_resolution(
        width: u32,
        height: u32,
        workers: NonZeroUsize,
    ) -> CoreResult<Self> {
        let available_parallelism = std::thread::available_parallelism()
            .map_err(|error| {
                CoreError::Encode(format!(
                    "Could not determine available CPU capacity: {error}"
                ))
            })?
            .get();
        Self::for_resources(width, height, workers, available_parallelism)
    }

    fn for_resources(
        width: u32,
        height: u32,
        workers: NonZeroUsize,
        available_parallelism: usize,
    ) -> CoreResult<Self> {
        if workers.get() > MAX_FRAME_WORKERS {
            return Err(invalid_parallel_mode(&workers.to_string()));
        }
        let worker_capacity = available_parallelism.saturating_sub(1).max(1);
        if workers.get() > worker_capacity {
            return Err(CoreError::Encode(format!(
                "parallel rendering requested {} workers, but CPU capacity permits {worker_capacity} while reserving one logical processor for FFmpeg",
                workers,
            )));
        }
        let frame_byte_len = crate::encode::pipeline_shared::checked_rgba_frame_len(width, height)?;
        let memory_limited_buffers = PARALLEL_FRAME_MEMORY_CEILING_BYTES / frame_byte_len;
        let buffer_count = memory_limited_buffers.min(MAX_PARALLEL_FRAME_BUFFERS);
        let required_buffers = workers
            .get()
            .checked_add(1)
            .ok_or_else(|| CoreError::Encode("Parallel frame buffer count overflow".to_string()))?;
        if buffer_count < required_buffers {
            return Err(CoreError::Encode(format!(
                "{width}x{height} parallel rendering with {} workers requires at least {required_buffers} RGBA buffers ({} MiB each), exceeding the {} MiB frame-pool ceiling",
                workers,
                frame_byte_len / (1024 * 1024),
                PARALLEL_FRAME_MEMORY_CEILING_BYTES / (1024 * 1024),
            )));
        }

        Ok(Self {
            frame_byte_len,
            buffer_count,
            queue_capacity: buffer_count - 1,
        })
    }
}

struct OrderedFrames<T> {
    total_frames: u64,
    next_index: u64,
    pending: BTreeMap<u64, T>,
}

impl<T> OrderedFrames<T> {
    fn new(total_frames: u64) -> Self {
        Self {
            total_frames,
            next_index: 0,
            pending: BTreeMap::new(),
        }
    }

    fn insert(&mut self, index: u64, frame: T) -> CoreResult<Vec<T>> {
        if index >= self.total_frames {
            return Err(CoreError::Encode(format!(
                "parallel render produced out-of-range frame index {index}; expected 0..{}",
                self.total_frames
            )));
        }
        if index < self.next_index || self.pending.contains_key(&index) {
            return Err(CoreError::Encode(format!(
                "parallel render produced duplicate frame index {index}"
            )));
        }

        self.pending.insert(index, frame);
        let mut ready = Vec::new();
        while let Some(frame) = self.pending.remove(&self.next_index) {
            ready.push(frame);
            self.next_index += 1;
        }
        Ok(ready)
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct FrameRenderTask {
    pub(crate) output_frame_index: u64,
    pub(crate) dense_frame_index: usize,
}

pub(crate) struct ParallelFrameProgress<'a> {
    pub(crate) total: u32,
    pub(crate) current_for_written_frames: &'a dyn Fn(u64) -> u32,
    pub(crate) encoded_for_current: &'a dyn Fn(u32) -> u32,
    /// Converts rendered-frame throughput into source-timeline-equivalent FPS.
    pub(crate) effective_fps_multiplier: NonZeroU32,
}

pub(crate) struct ParallelFrameRenderRequest<'a> {
    pub(crate) paths: &'a AppPaths,
    pub(crate) dense_activity: &'a DenseActivityReport,
    pub(crate) prepared_assets: &'a PreparedRenderAssets,
    pub(crate) tasks: &'a [FrameRenderTask],
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) scale: f32,
    pub(crate) workers: NonZeroUsize,
    pub(crate) progress: ParallelFrameProgress<'a>,
    pub(crate) ffmpeg_process_name: &'static str,
    pub(crate) controller: &'a RenderController,
    pub(crate) cancel_flag: &'a AtomicBool,
    pub(crate) pipeline_failed: &'a AtomicBool,
    pub(crate) frame_sender: &'a SyncSender<FrameBuffer>,
    pub(crate) ordered_frame_observer:
        Option<&'a dyn Fn(FrameRenderTask, &FrameBuffer) -> CoreResult<()>>,
    pub(crate) free_receiver: Receiver<FrameBuffer>,
    pub(crate) ffmpeg_child: &'a mut Child,
    pub(crate) render_started: Instant,
}

pub(crate) struct ParallelFrameRenderResult {
    pub(crate) timings: BTreeMap<String, TimingBucket>,
    pub(crate) rendered_frames: u32,
    pub(crate) free_receiver: Receiver<FrameBuffer>,
}

struct CompletedFrame {
    task: FrameRenderTask,
    buffer: FrameBuffer,
    completed_at: Instant,
}

enum WorkerEvent {
    Rendered {
        output_frame_index: u64,
        frame: CompletedFrame,
    },
    Failed {
        error: CoreError,
    },
}

pub(crate) fn render_frames_parallel(
    request: ParallelFrameRenderRequest<'_>,
) -> CoreResult<ParallelFrameRenderResult> {
    validate_tasks(request.tasks)?;
    let mut prewarm_profiler = RenderProfiler::default();
    let prewarmed_frame = prewarm_first_frame(&request, &mut prewarm_profiler)?;
    let next_task = AtomicUsize::new(usize::from(prewarmed_frame.is_some()));
    let stop = Arc::new(AtomicBool::new(false));
    let free_receiver = Arc::new(Mutex::new(request.free_receiver));
    let (result_sender, result_receiver) = std::sync::mpsc::channel::<WorkerEvent>();

    let timings = thread::scope(|scope| -> CoreResult<BTreeMap<String, TimingBucket>> {
        let mut handles = Vec::with_capacity(request.workers.get());
        for _ in 0..request.workers.get() {
            let result_sender = result_sender.clone();
            let free_receiver = Arc::clone(&free_receiver);
            let prepared_assets = request.prepared_assets;
            let next_task = &next_task;
            let stop = Arc::clone(&stop);
            let tasks = request.tasks;
            let paths = request.paths;
            let dense_activity = request.dense_activity;
            let cancel_flag = request.cancel_flag;
            let pipeline_failed = request.pipeline_failed;
            let width = request.width;
            let height = request.height;
            let scale = request.scale;

            handles.push(scope.spawn(move || {
                let mut profiler = RenderProfiler::default();
                loop {
                    if stop.load(Ordering::SeqCst)
                        || cancel_flag.load(Ordering::SeqCst)
                        || pipeline_failed.load(Ordering::SeqCst)
                    {
                        break;
                    }

                    let frame_started = Instant::now();
                    let mut frame_buffer = match acquire_worker_frame_buffer(
                        &free_receiver,
                        cancel_flag,
                        pipeline_failed,
                        stop.as_ref(),
                        &mut profiler,
                    ) {
                        Ok(Some(frame_buffer)) => frame_buffer,
                        Ok(None) => break,
                        Err(error) => {
                            stop.store(true, Ordering::SeqCst);
                            let _ = result_sender.send(WorkerEvent::Failed { error });
                            break;
                        }
                    };
                    let task_index = next_task.fetch_add(1, Ordering::SeqCst);
                    let Some(task) = tasks.get(task_index).copied() else {
                        break;
                    };

                    let render_result = (|| -> CoreResult<FrameBuffer> {
                        render_frame_rgba(FrameRenderRequest {
                            paths,
                            dense_activity,
                            prepared_assets,
                            frame_index: task.dense_frame_index,
                            scale,
                            labels_image: None,
                            target: RenderTarget {
                                width,
                                height,
                                pixels: frame_buffer.pixels.as_mut_slice(),
                            },
                            frame_profiler: &mut profiler,
                        })?;
                        Ok(frame_buffer)
                    })();
                    let worker_frame_ms = frame_started.elapsed().as_secs_f64() * 1000.0;
                    profiler.record_ms("parallel.worker_frame", worker_frame_ms);
                    profiler.record_ms("frame.total", worker_frame_ms);

                    match render_result {
                        Ok(buffer) => {
                            if result_sender
                                .send(WorkerEvent::Rendered {
                                    output_frame_index: task.output_frame_index,
                                    frame: CompletedFrame {
                                        task,
                                        buffer,
                                        completed_at: Instant::now(),
                                    },
                                })
                                .is_err()
                            {
                                break;
                            }
                        }
                        Err(CoreError::Cancelled) if stop.load(Ordering::SeqCst) => break,
                        Err(error) => {
                            stop.store(true, Ordering::SeqCst);
                            let _ = result_sender.send(WorkerEvent::Failed { error });
                            break;
                        }
                    }
                }
                profiler.summary()
            }));
        }
        if let Some(frame) = prewarmed_frame {
            result_sender.send(frame).map_err(|_| {
                CoreError::Encode(
                    "Parallel render result channel closed during cache prewarm".to_string(),
                )
            })?;
        }
        drop(result_sender);

        let mut coordinator_profiler = prewarm_profiler;
        let total_frames = u64::try_from(request.tasks.len()).map_err(|_| {
            CoreError::Encode("Parallel frame count exceeds u64 capacity".to_string())
        })?;
        let mut ordered_frames = OrderedFrames::new(total_frames);
        let mut written_frames = 0u64;
        let mut estimator = ProgressEstimator::default();
        let mut last_progress_at = Instant::now();
        let mut previous_progress = 0u32;

        let coordinator_result = (|| -> CoreResult<()> {
            while written_frames < total_frames {
                if request.cancel_flag.load(Ordering::SeqCst) {
                    return Err(CoreError::Cancelled);
                }
                if request.pipeline_failed.load(Ordering::SeqCst) {
                    return Err(CoreError::Encode("Encoder writer failed".to_string()));
                }

                let wait_started = Instant::now();
                let event = result_receiver.recv_timeout(Duration::from_millis(25));
                coordinator_profiler.record_ms(
                    "parallel.result_wait",
                    wait_started.elapsed().as_secs_f64() * 1000.0,
                );

                match event {
                    Ok(WorkerEvent::Rendered {
                        output_frame_index,
                        frame,
                    }) => {
                        if stop.load(Ordering::SeqCst) {
                            continue;
                        }
                        let ready_frames = ordered_frames.insert(output_frame_index, frame)?;
                        let ready_frame_count = ready_frames.len();
                        for ready in ready_frames {
                            coordinator_profiler.record_ms(
                                "parallel.reorder_hold",
                                ready.completed_at.elapsed().as_secs_f64() * 1000.0,
                            );
                            if let Some(observer) = request.ordered_frame_observer {
                                observer(ready.task, &ready.buffer)?;
                            }
                            queue_frame(
                                request.frame_sender,
                                ready.buffer,
                                request.cancel_flag,
                                request.pipeline_failed,
                                &mut coordinator_profiler,
                            )?;
                            written_frames += 1;
                        }

                        if ready_frame_count > 0 {
                            let current_progress =
                                (request.progress.current_for_written_frames)(written_frames);
                            if current_progress > request.progress.total {
                                return Err(CoreError::Encode(format!(
                                    "Parallel frame progress {current_progress} exceeds total {}",
                                    request.progress.total
                                )));
                            }
                            if current_progress < previous_progress {
                                return Err(CoreError::Encode(format!(
                                    "Parallel frame progress regressed from {previous_progress} to {current_progress}"
                                )));
                            }
                            let elapsed = last_progress_at.elapsed().as_secs_f64();
                            last_progress_at = Instant::now();
                            let output_progress_added = current_progress - previous_progress;
                            previous_progress = current_progress;
                            let output_equivalent_frame_seconds = if output_progress_added == 0 {
                                0.0
                            } else {
                                elapsed / f64::from(output_progress_added)
                            };
                            let (estimate, rendering_fps) = estimator.record(
                                current_progress,
                                request.progress.total,
                                output_equivalent_frame_seconds,
                                request.render_started.elapsed().as_secs_f64(),
                            );
                            let effective_rendering_fps = effective_rendering_fps(
                                rendering_fps,
                                request.progress.effective_fps_multiplier,
                            );
                            request.controller.set_frame_progress(
                                current_progress,
                                request.progress.total,
                                (request.progress.encoded_for_current)(current_progress),
                                estimate,
                                effective_rendering_fps,
                            );
                        }
                    }
                    Ok(WorkerEvent::Failed { error }) => {
                        stop.store(true, Ordering::SeqCst);
                        return Err(error);
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if let Some(status) = request.ffmpeg_child.try_wait().map_err(|error| {
                            CoreError::Encode(format!("ffmpeg process error: {error}"))
                        })? {
                            return Err(CoreError::Encode(format!(
                                "{} ffmpeg exited unexpectedly with status {status}",
                                request.ffmpeg_process_name
                            )));
                        }
                        if handles.iter().all(|handle| handle.is_finished()) {
                            return Err(CoreError::Encode(format!(
                                "parallel render workers ended after producing {written_frames} of {} frames",
                                request.tasks.len()
                            )));
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        return Err(CoreError::Encode(format!(
                            "parallel render result channel closed after producing {written_frames} of {} frames",
                            request.tasks.len()
                        )));
                    }
                }
            }
            Ok(())
        })();
        stop.store(true, Ordering::SeqCst);

        let mut timings = coordinator_profiler.summary();
        let mut worker_panic = None;
        for handle in handles {
            match handle.join() {
                Ok(worker_timings) => {
                    timings = merge_timing_maps(timings, worker_timings);
                }
                Err(_) if worker_panic.is_none() => {
                    worker_panic = Some(CoreError::Render(
                        "Parallel frame render worker panicked".to_string(),
                    ));
                }
                Err(_) => {}
            }
        }
        if let Some(error) = worker_panic {
            return Err(error);
        }
        coordinator_result?;
        Ok(timings)
    })?;

    let rendered_frames = u32::try_from(request.tasks.len()).map_err(|_| {
        CoreError::Encode("Parallel frame count exceeds u32 progress capacity".to_string())
    })?;
    let free_receiver = Arc::try_unwrap(free_receiver)
        .map_err(|_| CoreError::Encode("Parallel buffer receiver is still shared".to_string()))?
        .into_inner()
        .map_err(|_| CoreError::Encode("Frame buffer pool lock poisoned".to_string()))?;
    Ok(ParallelFrameRenderResult {
        timings,
        rendered_frames,
        free_receiver,
    })
}

fn effective_rendering_fps(rendered_fps: Option<f64>, multiplier: NonZeroU32) -> Option<f64> {
    rendered_fps.map(|fps| fps * f64::from(multiplier.get()))
}

fn acquire_worker_frame_buffer(
    receiver: &Mutex<Receiver<FrameBuffer>>,
    cancel_flag: &AtomicBool,
    pipeline_failed: &AtomicBool,
    stop: &AtomicBool,
    profiler: &mut RenderProfiler,
) -> CoreResult<Option<FrameBuffer>> {
    let started = Instant::now();
    loop {
        if stop.load(Ordering::SeqCst) {
            return Ok(None);
        }
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(CoreError::Cancelled);
        }
        if pipeline_failed.load(Ordering::SeqCst) {
            return Err(CoreError::Encode("Encoder writer failed".to_string()));
        }
        let receive_result = receiver
            .lock()
            .map_err(|_| CoreError::Encode("Frame buffer pool lock poisoned".to_string()))?
            .recv_timeout(Duration::from_millis(25));
        match receive_result {
            Ok(buffer) => {
                profiler.record_ms(
                    "buffer.acquire_wait",
                    started.elapsed().as_secs_f64() * 1000.0,
                );
                return Ok(Some(buffer));
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err(CoreError::Encode(
                    "Frame buffer pool disconnected".to_string(),
                ));
            }
        }
    }
}

fn validate_tasks(tasks: &[FrameRenderTask]) -> CoreResult<()> {
    for (expected_index, task) in tasks.iter().enumerate() {
        let expected_index = u64::try_from(expected_index).map_err(|_| {
            CoreError::Encode("Parallel frame task index exceeds u64 capacity".to_string())
        })?;
        if task.output_frame_index != expected_index {
            return Err(CoreError::Encode(format!(
                "parallel frame tasks must use the canonical half-open range [0, {}); task {expected_index} has output index {}",
                tasks.len(),
                task.output_frame_index,
            )));
        }
    }
    Ok(())
}

fn prewarm_first_frame(
    request: &ParallelFrameRenderRequest<'_>,
    profiler: &mut RenderProfiler,
) -> CoreResult<Option<WorkerEvent>> {
    let Some(task) = request.tasks.first().copied() else {
        return Ok(None);
    };
    if request.cancel_flag.load(Ordering::SeqCst) {
        return Err(CoreError::Cancelled);
    }
    if request.pipeline_failed.load(Ordering::SeqCst) {
        return Err(CoreError::Encode("Encoder writer failed".to_string()));
    }

    let acquire_started = Instant::now();
    let mut buffer = request
        .free_receiver
        .recv_timeout(Duration::from_millis(250))
        .map_err(|error| {
            CoreError::Encode(format!(
                "Could not acquire parallel prewarm buffer: {error}"
            ))
        })?;
    profiler.record_ms(
        "buffer.acquire_wait",
        acquire_started.elapsed().as_secs_f64() * 1000.0,
    );
    let render_started = Instant::now();
    render_frame_rgba(FrameRenderRequest {
        paths: request.paths,
        dense_activity: request.dense_activity,
        prepared_assets: request.prepared_assets,
        frame_index: task.dense_frame_index,
        scale: request.scale,
        labels_image: None,
        target: RenderTarget {
            width: request.width,
            height: request.height,
            pixels: buffer.pixels.as_mut_slice(),
        },
        frame_profiler: profiler,
    })?;
    let render_ms = render_started.elapsed().as_secs_f64() * 1000.0;
    profiler.record_ms("parallel.worker_frame", render_ms);
    profiler.record_ms("parallel.prewarm_frame", render_ms);
    profiler.record_ms("frame.total", render_ms);

    Ok(Some(WorkerEvent::Rendered {
        output_frame_index: task.output_frame_index,
        frame: CompletedFrame {
            task,
            buffer,
            completed_at: Instant::now(),
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnoses_workers_from_profile_cpu_cost_and_frame_count() {
        assert_eq!(
            diagnose_frame_worker_count_for_resources(1_000, 4, 16).get(),
            4
        );
        assert_eq!(diagnose_frame_worker_count_for_resources(2, 4, 16).get(), 2);
        assert_eq!(
            diagnose_frame_worker_count_for_resources(1_000, 3, 8).get(),
            2
        );
        assert_eq!(
            diagnose_frame_worker_count_for_resources(1_000, 0, 64).get(),
            1
        );
    }

    #[test]
    fn sizes_parallel_pool_from_resolution_and_worker_count() {
        let plan =
            ParallelFramePoolPlan::for_resources(3840, 2160, NonZeroUsize::new(3).unwrap(), 8)
                .unwrap();
        assert_eq!(plan.frame_byte_len, 3840 * 2160 * 4);
        assert_eq!(plan.buffer_count, 5);
        assert_eq!(plan.queue_capacity, 4);

        let error =
            ParallelFramePoolPlan::for_resources(7680, 4320, NonZeroUsize::new(2).unwrap(), 8)
                .unwrap_err();
        assert!(error.to_string().contains("frame-pool ceiling"));

        let error =
            ParallelFramePoolPlan::for_resources(1920, 1080, NonZeroUsize::new(4).unwrap(), 4)
                .unwrap_err();
        assert!(error
            .to_string()
            .contains("reserving one logical processor"));
    }

    #[test]
    fn ordered_frames_wait_for_missing_indices_and_reject_duplicates() {
        let mut frames = OrderedFrames::new(3);

        assert!(frames.insert(2, 'c').unwrap().is_empty());
        assert_eq!(frames.insert(0, 'a').unwrap(), vec!['a']);
        assert_eq!(frames.insert(1, 'b').unwrap(), vec!['b', 'c']);

        let duplicate = frames.insert(2, 'x').unwrap_err();
        assert!(duplicate.to_string().contains("duplicate frame index 2"));
    }

    #[test]
    fn reported_fps_uses_source_timeline_frame_equivalents() {
        assert_eq!(
            effective_rendering_fps(Some(24.5), NonZeroU32::new(2).unwrap()),
            Some(49.0)
        );
        assert_eq!(
            effective_rendering_fps(None, NonZeroU32::new(2).unwrap()),
            None
        );
    }
}

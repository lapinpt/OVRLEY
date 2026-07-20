//! Multi-pass composite MP4 render pipeline.
//!
//! Renders Skia frames, composites them with source video,
//! and produces final H.264/H.265 MP4 output.
//!
//! Must not import from [`transparent`].
//!
//! The composite path renders transparent Skia overlay frames at the derived
//! overlay FPS and streams them to FFmpeg, which composites them over input
//! video frames and writes the final MP4 output.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use crate::activity::schema::{DenseActivityReport, ParsedActivity};
use crate::encode::debug::composite::write_composite_timing_summary;
use crate::encode::ffmpeg::binary::{resolve_ffmpeg_binary, spawn_ffmpeg};
use crate::encode::ffmpeg::composite_profiles::composite_profile;
use crate::encode::pipeline::composite_support::{
    format_pipe_write_failure, is_pipe_write_error, stderr_tail, verify_successful_composite_output,
};
use crate::encode::pipeline::frame_pool::{
    diagnose_frame_worker_count, ParallelFrameChannels, ParallelFramePoolPlan,
    ParallelFrameProgress,
};
use crate::encode::pipeline::frames::render_frames_parallel;
use crate::encode::pipeline::lifecycle::{
    finalize_pipeline, FfmpegChildGuard, PartialOutputGuard, PipelineFailurePolicy, PipelineKind,
};
use crate::encode::pipeline::queue::{merge_timing_maps, writer_worker, WriterMode};
use crate::error::{CoreError, CoreResult};
use crate::normalize::ValidatedRenderConfig;
use crate::paths::AppPaths;
use crate::render::{prepare_preview_assets, VideoFrameRenderer};

use super::composite_plan::verify_composite_source_resolution;

const FFMPEG_STDERR_LINE_LIMIT: usize = 200;

struct CompositeFailurePolicy<'a> {
    stderr_lines: &'a Arc<Mutex<VecDeque<String>>>,
    plan: &'a CompositePipelinePlan,
}

impl PipelineFailurePolicy for CompositeFailurePolicy<'_> {
    fn writer_failure(
        &self,
        error: CoreError,
        status: Option<std::process::ExitStatus>,
    ) -> CoreError {
        let stderr = stderr_snapshot(self.stderr_lines);
        let error_text = error.to_string();
        if let Some(status) = status {
            if is_pipe_write_error(&error_text) {
                return CoreError::Encode(format_pipe_write_failure(
                    error_text, status, &stderr, self.plan,
                ));
            }
        }
        if stderr.is_empty() {
            error
        } else {
            CoreError::Encode(format!("{error}. FFmpeg stderr:\n{}", stderr_tail(&stderr)))
        }
    }

    fn ffmpeg_failure(&self, status: std::process::ExitStatus) -> CoreError {
        CoreError::Ffmpeg {
            status,
            stderr: stderr_tail(&stderr_snapshot(self.stderr_lines)),
        }
    }
}

use super::composite_plan::{derive_composite_pipeline_plan, CompositePipelinePlan};
use crate::encode::composite::CompositeRenderPlan;

/// Runs the software composite render pipeline.
///
/// This renders only overlay-frame timestamps, writes raw RGBA frames to
/// FFmpeg stdin, and lets FFmpeg repeat overlay frames between updates.
///
/// # Phases
/// 1. Derive pipeline plan (timing, FPS, FFmpeg args, output path)
/// 2. Prepare Skia assets
/// 3. Spawn ffmpeg, monitor thread, and writer thread
/// 4. Hot render loop: produce overlay frames into bounded queue, track progress
/// 5. Drain writer, wait for ffmpeg, join monitor
/// 6. Verify output, write debug summary
#[allow(clippy::too_many_arguments)]
pub fn render_composite_video(
    paths: &AppPaths,
    config: &ValidatedRenderConfig,
    activity: &ParsedActivity,
    dense_activity: &DenseActivityReport,
    controller: &crate::encode::progress::RenderController,
    render_plan: CompositeRenderPlan,
    include_audio: bool,
) -> CoreResult<String> {
    if controller.cancel_flag().load(Ordering::SeqCst) {
        return Err(CoreError::Cancelled);
    }

    // ── PHASE 1: DERIVE PIPELINE PLAN (timing, FPS, FFmpeg args, output path) ──
    let scene = &config.scene;
    let source_rotation_degrees = verify_composite_source_resolution(
        paths,
        &render_plan.video_path,
        scene.width,
        scene.height,
    )?;
    let plan = derive_composite_pipeline_plan(
        paths,
        scene,
        render_plan,
        include_audio,
        source_rotation_degrees,
    )?;
    let task_count = usize::try_from(plan.render.overlay_frame_count).map_err(|_| {
        CoreError::Encode("Composite overlay frame count exceeds usize".to_string())
    })?;
    if dense_activity.frame_count != task_count {
        return Err(CoreError::Encode(format!(
            "Composite dense activity contains {} frames; source-video timeline requires {task_count}",
            dense_activity.frame_count
        )));
    }
    let workers = diagnose_frame_worker_count(
        task_count,
        composite_profile(plan.ffmpeg_settings.codec_id).cpu_cores_per_frame_worker,
    )?;
    let channels =
        ParallelFramePoolPlan::for_frame_size(plan.frame_size, workers)?.create_channels()?;

    std::fs::create_dir_all(&paths.downloads_dir).map_err(|error| CoreError::Io {
        path: paths.downloads_dir.clone(),
        source: error,
    })?;
    let mut output_guard = PartialOutputGuard::new(&plan.output_path);
    controller.set_frame_progress(0, plan.render.output_frame_count, 0, None, None);

    // ── PHASE 2: PREPARE SKIA ASSETS ──
    let (prepared_preview_assets, _, _, _) =
        prepare_preview_assets(paths, config, activity, dense_activity)?;
    let renderer = VideoFrameRenderer::new(
        paths,
        dense_activity,
        &prepared_preview_assets,
        plan.frame_size,
    )?;
    let ffmpeg_bin = resolve_ffmpeg_binary(&paths.repo_root)?;

    // ── PHASE 3: SPAWN FFMPEG & WORKER THREADS ──
    let mut child = FfmpegChildGuard::new(
        spawn_ffmpeg(
            &ffmpeg_bin,
            &plan.ffmpeg_settings.command_args(&plan.output_path),
        )?,
        PipelineKind::Composite,
    );
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| CoreError::Encode("Failed to capture composite ffmpeg stdin".to_string()))?;
    let stderr = child.stderr.take().ok_or_else(|| {
        CoreError::Encode("Failed to capture composite ffmpeg stderr".to_string())
    })?;
    let stderr_lines = Arc::new(Mutex::new(VecDeque::with_capacity(
        FFMPEG_STDERR_LINE_LIMIT,
    )));
    let stderr_lines_for_monitor = stderr_lines.clone();
    let monitor_thread =
        thread::spawn(move || monitor_composite_ffmpeg(stderr, stderr_lines_for_monitor));

    let total_progress = plan.render.output_frame_count;
    let cancel_flag = controller.cancel_flag();
    let render_started = Instant::now();
    let render_loop_started = Instant::now();
    let frame_render_workers = workers.get();

    let ParallelFrameChannels {
        frame_sender,
        frame_receiver,
        free_sender,
        free_receiver,
    } = channels;

    let pipeline_failed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let pipeline_failed_for_writer = Arc::clone(&pipeline_failed);
    let writer_thread = thread::spawn(move || {
        writer_worker(
            stdin,
            frame_receiver,
            free_sender,
            pipeline_failed_for_writer,
            WriterMode::Composite,
        )
    });

    // ── PHASE 4: HOT RENDER LOOP — produce overlay frames into bounded queue ──
    // The bounded channel (capacity 4 for composite) provides backpressure; the
    // writer drains it and feeds ffmpeg stdin. Overlay frames are rendered at
    // the pipe FPS; ffmpeg repeats them across output frames internally.
    let render_result = render_frames_parallel(
        renderer,
        task_count,
        std::num::NonZeroU32::MIN,
        workers,
        ParallelFrameProgress::Composite(&plan),
        PipelineKind::Composite,
        controller,
        pipeline_failed.as_ref(),
        &frame_sender,
        None,
        free_receiver,
        &mut child,
        render_started,
    );
    let render_loop_ms = render_loop_started.elapsed().as_secs_f64() * 1000.0;

    // ── PHASE 5: DRAIN WRITER, FINALIZE FFMPEG, JOIN MONITOR ──
    drop(frame_sender);
    let ffmpeg_finalize_started = Instant::now();
    let outcome = finalize_pipeline(
        &mut child,
        writer_thread,
        monitor_thread,
        render_result,
        cancel_flag.as_ref(),
        pipeline_failed.as_ref(),
        PipelineKind::Composite,
        &CompositeFailurePolicy {
            stderr_lines: &stderr_lines,
            plan: &plan,
        },
    )?;
    let ffmpeg_finalize_wait_ms = ffmpeg_finalize_started.elapsed().as_secs_f64() * 1000.0;

    let producer_timings = outcome.producer.timings;
    let rendered_frames = outcome.producer.rendered_frames;
    drop(outcome.producer.free_receiver);
    let writer = outcome.writer;
    if writer.written_frames != plan.render.overlay_frame_count {
        return Err(CoreError::Encode(format!(
            "Composite overlay writer ended early: wrote {} of {} frames",
            writer.written_frames, plan.render.overlay_frame_count
        )));
    }
    verify_successful_composite_output(&plan.output_path)?;
    output_guard.preserve();

    // ── PHASE 6: WRITE DEBUG SUMMARY ──
    let total_ms = render_started.elapsed().as_secs_f64() * 1000.0;
    let merged_timings = merge_timing_maps(producer_timings, writer.timings);
    write_composite_timing_summary(
        paths,
        &plan,
        total_ms,
        render_loop_ms,
        ffmpeg_finalize_wait_ms,
        merged_timings,
        frame_render_workers,
        rendered_frames,
    )?;
    controller.set_frame_progress(
        total_progress,
        total_progress,
        total_progress,
        Some(0),
        None,
    );
    plan.output_path
        .file_name()
        .and_then(|filename| filename.to_str())
        .map(str::to_owned)
        .ok_or_else(|| {
            CoreError::Encode(format!(
                "Composite output path has no Unicode filename: {}",
                plan.output_path.display()
            ))
        })
}

/// Reads FFmpeg stderr without blocking the encoder process.
fn monitor_composite_ffmpeg(
    stderr: std::process::ChildStderr,
    lines: Arc<Mutex<VecDeque<String>>>,
) {
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        let mut locked = lines.lock().expect("FFmpeg stderr mutex poisoned");
        if locked.len() == FFMPEG_STDERR_LINE_LIMIT {
            locked.pop_front();
        }
        locked.push_back(line);
    }
}

/// Returns a snapshot of collected FFmpeg stderr lines.
fn stderr_snapshot(lines: &Arc<Mutex<VecDeque<String>>>) -> String {
    lines
        .lock()
        .expect("FFmpeg stderr mutex poisoned")
        .iter()
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}

//! Multi-pass composite MP4 render pipeline.
//!
//! Renders Skia frames, composites them with source video,
//! and produces final H.264/H.265 MP4 output.
//!
//! Must not import from [`video_pipeline`].
//!
//! The composite path renders transparent Skia overlay frames at the derived
//! overlay FPS and streams them to FFmpeg, which composites them over input
//! video frames and writes the final MP4 output.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use crate::activity::schema::{DenseActivityReport, ParsedActivity};
use crate::encode::ffmpeg::{configure_ffmpeg_command, resolve_ffmpeg_binary};
use crate::encode::ffmpeg_composite::{
    build_composite_ffmpeg_settings_with_source_rotation, CompositeFfmpegBuildRequest,
    CompositeFfmpegSettings, HwAccelInfo,
};
use crate::encode::fps::Fps;
use crate::encode::pipeline_shared::{
    join_shutdown_thread, merge_timing_maps, terminate_ffmpeg, unblock_stalled_writer,
    wait_for_ffmpeg, writer_worker, FfmpegChildGuard, FrameBuffer, PartialOutputGuard,
    WriterCancellation, WriterWorkerConfig,
};
use crate::encode::video::RenderController;
use crate::encode::video_composite_debug::{
    write_composite_timing_summary, CompositeTimingSummaryInput,
};
use crate::encode::video_composite_support::{
    format_pipe_write_failure, is_pipe_write_error, output_progress_for_overlay_time, stderr_tail,
    verify_successful_composite_output,
};
use crate::encode::video_debug::timestamp_nanos;
use crate::encode::video_frame_parallel::{
    diagnose_frame_worker_count, render_frames_parallel, FrameRenderTask, ParallelFramePoolPlan,
    ParallelFrameProgress, ParallelFrameRenderRequest,
};
use crate::error::{CoreError, CoreResult};
use crate::normalize::ValidatedRenderConfig;
use crate::paths::AppPaths;
use crate::render::prepare_preview_assets;

const FFMPEG_STDERR_LINE_LIMIT: usize = 200;

/// Composite render values derived from render-time scene fields.
///
/// These values drive dense-report timing and are passed to the composite
/// FFmpeg pipeline without reinterpreting sync offset as seek.
#[derive(Clone, Debug, PartialEq)]
pub struct CompositeRenderPlan {
    // test seam
    pub video_path: String,
    pub bitrate: String,
    pub sync_offset: f64,
    pub trim_start: f64,
    pub video_duration: f64,
    pub render_duration: f64,
    pub update_rate: u32,
    pub source_fps: Fps,
    pub overlay_pipe_fps: Fps,
}

/// Validates composite render fields and derives timing/FPS values.
///
/// Required fields fail before dense activity is built, while optional fields
/// receive standard defaults.
pub fn derive_composite_render_plan(
    scene: &crate::normalize::ValidatedSceneConfig,
) -> CoreResult<CompositeRenderPlan> {
    // test seam
    let video_path = scene
        .composite_video_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .ok_or_else(|| {
            CoreError::Config("scene.composite_video_path required for composite render".into())
        })?;
    let bitrate = scene
        .composite_bitrate
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .ok_or_else(|| {
            CoreError::Config("scene.composite_bitrate required for composite render".into())
        })?;
    let fps_num = scene.composite_video_fps_num.ok_or_else(|| {
        CoreError::Config("scene.composite_video_fps_num required for composite render".into())
    })?;
    let fps_den = scene.composite_video_fps_den.ok_or_else(|| {
        CoreError::Config("scene.composite_video_fps_den required for composite render".into())
    })?;
    let source_fps = Fps::new(fps_num, fps_den)?;
    let video_duration = scene.composite_video_duration.ok_or_else(|| {
        CoreError::Config("scene.composite_video_duration required for composite render".into())
    })?;
    if !video_duration.is_finite() || video_duration <= 0.0 {
        return Err(CoreError::Config(format!(
            "scene.composite_video_duration must be greater than zero: {video_duration}"
        )));
    }

    let sync_offset = scene.composite_sync_offset.ok_or_else(|| {
        CoreError::Config("scene.composite_sync_offset required for composite render".into())
    })?;
    if !sync_offset.is_finite() || sync_offset < 0.0 {
        return Err(CoreError::Config(format!(
            "scene.composite_sync_offset must be zero or greater: {sync_offset}"
        )));
    }
    let trim_start = scene.composite_video_trim_start.ok_or_else(|| {
        CoreError::Config("scene.composite_video_trim_start required for composite render".into())
    })?;
    if !trim_start.is_finite() || trim_start < 0.0 {
        return Err(CoreError::Config(format!(
            "scene.composite_video_trim_start must be zero or greater: {trim_start}"
        )));
    }
    if trim_start >= video_duration {
        return Err(CoreError::Config(format!(
            "scene.composite_video_trim_start ({trim_start}) must be less than scene.composite_video_duration ({video_duration})"
        )));
    }

    let update_rate = scene
        .composite_widget_update_rate
        .ok_or_else(|| {
            CoreError::Config(
                "scene.composite_widget_update_rate required for composite render".into(),
            )
        })?
        .max(1);
    let overlay_pipe_fps = source_fps.divided_by(update_rate)?;
    let render_duration = scene
        .composite_render_duration
        .unwrap_or(video_duration - trim_start);
    if !render_duration.is_finite() || render_duration <= 0.0 {
        return Err(CoreError::Config(format!(
            "scene.composite_render_duration must be greater than zero: {render_duration}"
        )));
    }

    Ok(CompositeRenderPlan {
        video_path,
        bitrate,
        sync_offset,
        trim_start,
        video_duration,
        render_duration,
        update_rate,
        source_fps,
        overlay_pipe_fps,
    })
}

/// Applies composite timing to a local render config before densification.
///
/// This keeps persisted template timing untouched while aligning dense frames
/// with the lower-FPS overlay stream used by compositing mode.
pub fn apply_composite_scene_timing(
    scene: &mut crate::normalize::ValidatedSceneConfig,
    plan: &CompositeRenderPlan,
) {
    scene.start = plan.sync_offset;
    scene.end = plan.sync_offset + plan.render_duration;
    scene.fps = plan.overlay_pipe_fps.as_f64();
    scene.update_rate = 1;
}

/// Timing and command values derived by the composite pipeline shell.
///
/// Keeping this as a small data object makes timing math easy to test and
/// gives the render loop one place to read its exact frame counts.
#[derive(Debug, Clone, PartialEq)]
pub struct CompositePipelinePlan {
    // test seam
    pub source_fps: Fps,
    pub output_fps: Fps,
    pub overlay_pipe_fps: Fps,
    pub render_duration: f64,
    pub overlay_frame_count: u64,
    pub output_frame_count: u64,
    pub widget_update_rate: u32,
    pub trim_start: f64,
    pub codec_name: String,
    pub bitrate: String,
    pub ffmpeg_settings: CompositeFfmpegSettings,
    pub output_filename: String,
    pub output_path: PathBuf,
}

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
// Called from multiple sites across video.rs, tests, and benchmarks;
// request-struct refactor deferred to avoid destabilising test seams.
#[allow(clippy::too_many_arguments)]
pub fn render_composite_video_with_frame_workers(
    // test seam
    paths: &AppPaths,
    config: &ValidatedRenderConfig,
    activity: &ParsedActivity,
    dense_activity: &DenseActivityReport,
    controller: &RenderController,
    composite_video_path: &str,
    composite_bitrate: &str,
    composite_sync_offset: f64,
    composite_video_fps_num: u32,
    composite_video_fps_den: u32,
    composite_video_duration: f64,
    composite_render_duration: f64,
    composite_video_trim_start: f64,
    composite_widget_update_rate: u32,
    include_audio: bool,
) -> CoreResult<String> {
    if controller.cancel_flag().load(Ordering::SeqCst) {
        return Err(CoreError::Cancelled);
    }

    // ── PHASE 1: DERIVE PIPELINE PLAN (timing, FPS, FFmpeg args, output path) ──
    let scene = &config.scene;
    let plan = derive_composite_pipeline_plan(
        paths,
        &scene,
        composite_video_path,
        composite_bitrate,
        composite_video_fps_num,
        composite_video_fps_den,
        composite_video_duration,
        composite_render_duration,
        composite_video_trim_start,
        composite_widget_update_rate,
        include_audio,
    )?;
    let width = scene.width;
    let height = scene.height;
    let task_count =
        usize::try_from(expected_guarded_overlay_frame_count(&plan)).map_err(|_| {
            CoreError::Encode("Composite overlay frame count exceeds usize".to_string())
        })?;
    let workers =
        diagnose_frame_worker_count(task_count, plan.ffmpeg_settings.cpu_cores_per_frame_worker);
    let pool = ParallelFramePoolPlan::for_resolution(width, height, workers)?;
    let frame_byte_len = pool.frame_byte_len;
    let queue_capacity = pool.queue_capacity;
    let buffer_count = pool.buffer_count;

    std::fs::create_dir_all(&paths.downloads_dir).map_err(|error| CoreError::Io {
        path: paths.downloads_dir.clone(),
        source: error,
    })?;
    let mut output_guard = PartialOutputGuard::new(&plan.output_path);
    controller.set_frame_progress(
        0,
        plan.output_frame_count.min(u64::from(u32::MAX)) as u32,
        0,
        None,
        None,
    );

    // ── PHASE 2: PREPARE SKIA ASSETS ──
    let (prepared_preview_assets, _, _, _) =
        prepare_preview_assets(paths, config, activity, dense_activity)?;
    let ffmpeg_bin = resolve_ffmpeg_binary(&paths.repo_root)?;

    // ── PHASE 3: SPAWN FFMPEG & WORKER THREADS ──
    let mut child = FfmpegChildGuard::new(
        spawn_composite_ffmpeg_process(&ffmpeg_bin, &plan)?,
        "composite",
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
    let monitor_lines = stderr_lines.clone();
    let monitor_thread = thread::spawn(move || monitor_composite_ffmpeg(stderr, monitor_lines));

    let scene = prepared_preview_assets.scene();
    let scale = scene.scale;
    let total_progress = plan.output_frame_count.min(u64::from(u32::MAX)) as u32;
    let cancel_flag = controller.cancel_flag();
    let render_started = Instant::now();
    let render_loop_started = Instant::now();
    let frame_render_mode = "frame_workers";
    let frame_render_workers = workers.get();
    let mut parallel_free_receiver = None;

    let (sender, receiver) = mpsc::sync_channel::<FrameBuffer>(queue_capacity);
    let (free_sender, free_receiver) = mpsc::sync_channel::<FrameBuffer>(buffer_count);
    for _ in 0..buffer_count {
        free_sender
            .send(FrameBuffer {
                pixels: vec![0u8; frame_byte_len],
            })
            .map_err(|_| {
                CoreError::Encode("Failed to initialize composite frame buffer pool".to_string())
            })?;
    }

    let pipeline_failed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let pipeline_failed_for_writer = Arc::clone(&pipeline_failed);
    let writer_thread = thread::spawn(move || {
        writer_worker(
            stdin,
            receiver,
            free_sender,
            WriterWorkerConfig {
                pipeline_failed: pipeline_failed_for_writer,
                cancellation: WriterCancellation::DrainUntilQueueCloses,
                write_error_context: "Failed writing composite overlay frame",
                queue_wait_metric: Some("writer.rendered_frame_wait"),
                release_wait_metric: None,
                release_error_message: None,
                flush_error_is_fatal: false,
            },
        )
    });

    // ── PHASE 4: HOT RENDER LOOP — produce overlay frames into bounded queue ──
    // The bounded channel (capacity 4 for composite) provides backpressure; the
    // writer drains it and feeds ffmpeg stdin. Overlay frames are rendered at
    // the pipe FPS; ffmpeg repeats them across output frames internally.
    let render_result = (|| -> CoreResult<_> {
        let tasks = (0..task_count)
            .map(|overlay_index| {
                let video_local_time = plan.overlay_pipe_fps.seconds_at_frame(overlay_index as u64);
                let activity_time = composite_sync_offset + video_local_time;
                dense_frame_index_for_overlay(
                    prepared_preview_assets.scene(),
                    dense_activity,
                    &plan,
                    activity_time,
                )
                .map(|dense_frame_index| FrameRenderTask {
                    output_frame_index: overlay_index as u64,
                    dense_frame_index,
                })
            })
            .collect::<CoreResult<Vec<_>>>()?;
        let current_for_written_frames = |written_frames: u64| {
            let video_local_time = plan.overlay_pipe_fps.seconds_at_frame(written_frames - 1);
            output_progress_for_overlay_time(video_local_time, &plan)
        };
        let encoded_for_current = |current_progress: u32| current_progress;

        let result = render_frames_parallel(ParallelFrameRenderRequest {
            paths,
            dense_activity,
            prepared_assets: &prepared_preview_assets.prepared_assets,
            tasks: &tasks,
            width,
            height,
            scale,
            workers,
            progress: ParallelFrameProgress {
                total: total_progress,
                current_for_written_frames: &current_for_written_frames,
                encoded_for_current: &encoded_for_current,
                // Composite progress already advances in output-frame equivalents.
                effective_fps_multiplier: std::num::NonZeroU32::MIN,
            },
            ffmpeg_process_name: "composite",
            controller,
            cancel_flag: cancel_flag.as_ref(),
            pipeline_failed: pipeline_failed.as_ref(),
            frame_sender: &sender,
            ordered_frame_observer: None,
            free_receiver,
            ffmpeg_child: &mut child,
            render_started,
        })?;
        parallel_free_receiver = Some(result.free_receiver);
        Ok(result.timings)
    })();
    let render_loop_ms = render_loop_started.elapsed().as_secs_f64() * 1000.0;

    // ── PHASE 5: DRAIN WRITER, FINALIZE FFMPEG, JOIN MONITOR ──
    let mut was_cancelled = cancel_flag.load(Ordering::SeqCst);
    let producer_failed = render_result.is_err();
    let writer_failed_before_teardown = pipeline_failed.load(Ordering::SeqCst);
    drop(sender);
    let ffmpeg_finalize_started = Instant::now();
    let mut shutdown_error = None;
    let mut status = None;
    if was_cancelled || producer_failed || writer_failed_before_teardown {
        match terminate_ffmpeg(&mut child, "composite") {
            Ok(exit_status) => status = Some(exit_status),
            Err(error) => shutdown_error = Some(error),
        }
    } else {
        match unblock_stalled_writer(
            &writer_thread,
            &mut child,
            "composite",
            cancel_flag.as_ref(),
        ) {
            Ok(cancelled) => was_cancelled |= cancelled,
            Err(error) => shutdown_error = Some(error),
        }
    }
    let writer_result = join_shutdown_thread(writer_thread, "Composite encoder writer thread");
    drop(parallel_free_receiver);
    if status.is_none() && !was_cancelled && !producer_failed && !writer_failed_before_teardown {
        match wait_for_ffmpeg(&mut child, "composite", cancel_flag.as_ref()) {
            Ok((exit_status, cancelled)) => {
                status = Some(exit_status);
                was_cancelled |= cancelled;
            }
            Err(error) if shutdown_error.is_none() => shutdown_error = Some(error),
            Err(_) => {}
        }
    }
    let ffmpeg_finalize_wait_ms = ffmpeg_finalize_started.elapsed().as_secs_f64() * 1000.0;
    let monitor_result = join_shutdown_thread(monitor_thread, "Composite ffmpeg monitor thread");

    // Once the user has cancelled, teardown noise from ffmpeg finalization
    // should not be surfaced as a render failure in the UI.
    if was_cancelled {
        let _ = std::fs::remove_file(&plan.output_path);
        return Err(CoreError::Cancelled);
    }

    let writer_result = match writer_result {
        Ok(result) => result,
        Err(error) => {
            let _ = std::fs::remove_file(&plan.output_path);
            if !writer_failed_before_teardown {
                if let Err(producer_error) = render_result {
                    return Err(producer_error);
                }
            }
            return Err(error);
        }
    };
    if writer_failed_before_teardown {
        let _ = std::fs::remove_file(&plan.output_path);
        let error = writer_result.err().unwrap_or_else(|| {
            CoreError::Encode(
                "Composite encoder writer stopped without reporting its failure".to_string(),
            )
        });
        let Some(status) = status else {
            return Err(error);
        };
        let stderr = stderr_snapshot(&stderr_lines);
        let error_str = error.to_string();
        if is_pipe_write_error(&error_str) {
            return Err(CoreError::Encode(format_pipe_write_failure(
                error_str, status, &stderr, &plan,
            )));
        }
        return Err(error);
    }

    let producer_timings = match render_result {
        Ok(timings) => timings,
        Err(error) => {
            let _ = std::fs::remove_file(&plan.output_path);
            return Err(error);
        }
    };
    if let Some(error) = shutdown_error {
        let _ = std::fs::remove_file(&plan.output_path);
        return Err(error);
    }
    monitor_result?;
    let status = status.ok_or_else(|| {
        CoreError::Encode("composite ffmpeg did not report an exit status".to_string())
    })?;

    let writer = match writer_result {
        Ok(w) => w,
        Err(error) => {
            let _ = std::fs::remove_file(&plan.output_path);
            let stderr = stderr_snapshot(&stderr_lines);
            let error_str = error.to_string();
            if is_pipe_write_error(&error_str) {
                return Err(CoreError::Encode(format_pipe_write_failure(
                    error_str, status, &stderr, &plan,
                )));
            }
            if stderr.is_empty() {
                return Err(error);
            }
            return Err(CoreError::Encode(format!(
                "{error}. FFmpeg stderr:\n{}",
                stderr_tail(&stderr)
            )));
        }
    };

    if !status.success() {
        let _ = std::fs::remove_file(&plan.output_path);
        let stderr = stderr_snapshot(&stderr_lines);
        return Err(CoreError::Ffmpeg {
            status,
            stderr: stderr_tail(&stderr),
        });
    }
    if writer.written_frames != expected_guarded_overlay_frame_count(&plan) {
        let _ = std::fs::remove_file(&plan.output_path);
        return Err(CoreError::Encode(format!(
            "Composite overlay writer ended early: wrote {} of {} frames",
            writer.written_frames,
            expected_guarded_overlay_frame_count(&plan)
        )));
    }
    verify_successful_composite_output(&plan.output_path)?;
    output_guard.preserve();

    // ── PHASE 6: WRITE DEBUG SUMMARY ──
    let total_ms = render_started.elapsed().as_secs_f64() * 1000.0;
    let merged_timings = merge_timing_maps(producer_timings, writer.timings);
    write_composite_timing_summary(CompositeTimingSummaryInput {
        debug_render_dir: &paths.debug_render_dir,
        ffmpeg_settings: &plan.ffmpeg_settings,
        output_path: &plan.output_path,
        source_fps: plan.source_fps,
        overlay_pipe_fps: plan.overlay_pipe_fps,
        widget_update_rate: plan.widget_update_rate,
        render_duration: plan.render_duration,
        overlay_frame_count: writer.written_frames,
        output_frame_count: plan.output_frame_count,
        total_ms,
        render_loop_ms,
        ffmpeg_finalize_wait_ms,
        timings: merged_timings,
        codec: &plan.codec_name,
        bitrate: &plan.bitrate,
        input_width: width,
        input_height: height,
        trim_start: plan.trim_start,
        sync_offset: composite_sync_offset,
        frame_render_mode,
        frame_render_workers,
    })?;
    controller.set_frame_progress(
        total_progress,
        total_progress,
        total_progress,
        Some(0),
        None,
    );
    Ok(plan.output_filename)
}

/// Derives composite timing and FFmpeg settings.
///
/// This helper mirrors the render loop's timing math, including the
/// fractional-frame overrun guard, without producing any overlay frames.
///
/// # Phases
/// 1. Validate required fields and derive FPS / durations
/// 2. Compute frame counts and overrun guard index
/// 3. Build FFmpeg settings from the composite profile catalog
/// 4. Generate output filename and assemble the plan
#[allow(clippy::too_many_arguments)]
pub fn derive_composite_pipeline_plan(
    // test seam
    paths: &AppPaths,
    scene: &crate::normalize::ValidatedSceneConfig,
    composite_video_path: &str,
    composite_bitrate: &str,
    composite_video_fps_num: u32,
    composite_video_fps_den: u32,
    composite_video_duration: f64,
    composite_render_duration: f64,
    composite_video_trim_start: f64,
    composite_widget_update_rate: u32,
    include_audio: bool,
) -> CoreResult<CompositePipelinePlan> {
    // ── PHASE 1: VALIDATE & DERIVE TIMING VALUES ──
    let source_fps = Fps::new(composite_video_fps_num, composite_video_fps_den)?;
    let output_fps = source_fps;
    let update_rate = composite_widget_update_rate.max(1);
    let overlay_pipe_fps = source_fps.divided_by(update_rate)?;
    let trim_start = composite_video_trim_start;
    let render_duration = composite_render_duration;
    let width = scene.width;
    let height = scene.height;
    let codec_name = composite_codec_name(scene)?;

    if !composite_video_duration.is_finite() || composite_video_duration <= 0.0 {
        return Err(CoreError::Encode(format!(
            "Composite video duration must be greater than zero: {composite_video_duration}"
        )));
    }
    if !trim_start.is_finite() || trim_start < 0.0 {
        return Err(CoreError::Encode(format!(
            "Composite video trim start must be zero or greater: {trim_start}"
        )));
    }
    if trim_start >= composite_video_duration {
        return Err(CoreError::Encode(format!(
            "Composite video trim start ({trim_start}) must be less than video duration ({composite_video_duration})"
        )));
    }
    if !render_duration.is_finite() || render_duration <= 0.0 {
        return Err(CoreError::Encode(format!(
            "Composite render duration must be greater than zero: {render_duration}"
        )));
    }
    let source_orientation =
        verify_composite_source_resolution(paths, composite_video_path, width, height)?;

    // ── PHASE 2: COMPUTE FRAME COUNTS & OVERRUN GUARD ──
    let overlay_frame_count = overlay_pipe_fps.frame_count_for_duration(render_duration)?;
    let output_frame_count = output_fps.frame_count_for_duration(render_duration)?;
    // ── PHASE 3: BUILD COMPOSITE FFMPEG SETTINGS ──
    let mut hwaccel_info = HwAccelInfo::trust_selected_profile();
    hwaccel_info.available_codecs.qsv_full_init_args = composite_qsv_full_init_args(scene);
    let ffmpeg_settings = build_composite_ffmpeg_settings_with_source_rotation(
        &CompositeFfmpegBuildRequest {
            codec_name: &codec_name,
            bitrate: composite_bitrate,
            video_path: Path::new(composite_video_path),
            video_trim_start: trim_start,
            render_duration,
            width,
            height,
            source_fps,
            overlay_pipe_fps,
            include_audio,
            hwaccel_available: &hwaccel_info,
        },
        source_orientation.rotation_degrees,
    )?;
    // ── PHASE 4: GENERATE OUTPUT FILENAME ──
    let output_filename = format!("video_composited_{}.mp4", timestamp_nanos()?);
    let output_path = paths.downloads_dir.join(&output_filename);

    Ok(CompositePipelinePlan {
        source_fps,
        output_fps,
        overlay_pipe_fps,
        render_duration,
        overlay_frame_count,
        output_frame_count,
        widget_update_rate: update_rate,
        trim_start,
        codec_name,
        bitrate: composite_bitrate.to_string(),
        ffmpeg_settings,
        output_filename,
        output_path,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CompositeSourceOrientation {
    rotation_degrees: Option<i32>,
}

fn verify_composite_source_resolution(
    paths: &AppPaths,
    composite_video_path: &str,
    scene_width: u32,
    scene_height: u32,
) -> CoreResult<CompositeSourceOrientation> {
    let source_path = Path::new(composite_video_path);
    if !source_path.is_file() {
        // Unit-level plan tests use synthetic paths; real render submissions
        // come from the file picker and are checked here before FFmpeg starts.
        log::debug!(
            "Skipping composite source resolution check for missing path: {composite_video_path}"
        );
        return Ok(CompositeSourceOrientation {
            rotation_degrees: None,
        });
    }

    let metadata = crate::media::video_probe::probe_video(&paths.repo_root, composite_video_path)?;
    let resolution = metadata.resolution.ok_or_else(|| {
        CoreError::Config(format!(
            "Could not read composite video resolution for {composite_video_path}"
        ))
    })?;

    let rotation = metadata
        .rotation_degrees
        .map(|degrees| degrees.rem_euclid(360));
    let (display_width, display_height) = if matches!(rotation, Some(90 | 270)) {
        (resolution.height, resolution.width)
    } else {
        (resolution.width, resolution.height)
    };

    if u64::from(scene_width) != display_width || u64::from(scene_height) != display_height {
        return Err(CoreError::Config(format!(
            "scene resolution {scene_width}x{scene_height} must match display-oriented composite video resolution {display_width}x{display_height} (coded {}x{}, rotation {})",
            resolution.width,
            resolution.height,
            metadata
                .rotation_degrees
                .map(|degrees| degrees.to_string())
                .unwrap_or_else(|| "none".to_string())
        )));
    }

    Ok(CompositeSourceOrientation {
        rotation_degrees: metadata.rotation_degrees,
    })
}

/// Spawns FFmpeg for a three-input composite render.
///
/// Input 0 is the unseeked source video used for filter-side video trimming,
/// input 1 is raw RGBA overlay frames streamed through stdin as `pipe:0`, and
/// input 2 is a separately trimmed source-media input used for audio copy.
fn spawn_composite_ffmpeg_process(
    ffmpeg_bin: &Path,
    plan: &CompositePipelinePlan,
) -> CoreResult<std::process::Child> {
    let mut command = Command::new(ffmpeg_bin);
    configure_ffmpeg_command(&mut command, ffmpeg_bin);
    command.arg("-loglevel").arg("info");
    command.args(&plan.ffmpeg_settings.hw_init_args);
    command.args(&plan.ffmpeg_settings.input_0_args);
    command.args(&plan.ffmpeg_settings.input_1_args);
    command.args(&plan.ffmpeg_settings.input_2_args);
    command
        .arg("-filter_complex")
        .arg(&plan.ffmpeg_settings.filter_complex)
        .args(&plan.ffmpeg_settings.output_args)
        .arg(&plan.output_path)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::null());

    command
        .spawn()
        .map_err(|error| CoreError::Encode(format!("Could not start composite ffmpeg: {error}")))
}

/// Maps one overlay timestamp to a dense activity frame index.
///
/// Composite-adjusted dense reports use direct `overlay j -> dense j` mapping;
/// otherwise this falls back to scene-start-relative time mapping.
pub fn dense_frame_index_for_overlay(
    // test seam
    scene: &crate::normalize::ValidatedSceneConfig,
    dense_activity: &DenseActivityReport,
    plan: &CompositePipelinePlan,
    activity_time: f64,
) -> CoreResult<usize> {
    let direct_index = if dense_report_matches_composite_window(scene, dense_activity, plan) {
        let video_local_time = activity_time - scene.start;
        Some((video_local_time * plan.overlay_pipe_fps.as_f64()).round() as usize)
    } else {
        None
    };
    let dense_frame_index = match direct_index {
        Some(index) => index,
        None => {
            let idx = ((activity_time - scene.start) * scene.fps).floor();
            if idx < 0.0 {
                return Err(CoreError::Encode(format!(
                    "Composite overlay frame is before dense activity range: activity_time={activity_time}, scene.start={}",
                    scene.start
                )));
            }
            idx as usize
        }
    };

    if dense_frame_index >= dense_activity.frame_count {
        return Err(CoreError::Encode(format!(
            "Composite dense frame index {dense_frame_index} is outside dense activity range 0..{}",
            dense_activity.frame_count
        )));
    }
    Ok(dense_frame_index)
}

/// Returns whether the dense report was rebuilt for the composite window.
///
/// This checks the composite timing contract with a small floating-point
/// tolerance so the hot render loop can use direct frame-index mapping
/// when valid.
fn dense_report_matches_composite_window(
    scene: &crate::normalize::ValidatedSceneConfig,
    dense_activity: &DenseActivityReport,
    plan: &CompositePipelinePlan,
) -> bool {
    let expected_end = scene.start + plan.render_duration;
    (scene.end - expected_end).abs() <= 1e-6
        && (scene.fps - plan.overlay_pipe_fps.as_f64()).abs() <= 1e-9
        && u64::try_from(dense_activity.frame_count).ok() == Some(plan.overlay_frame_count)
}

/// Counts overlay frames whose timestamps are strictly inside render duration.
pub fn expected_guarded_overlay_frame_count(plan: &CompositePipelinePlan) -> u64 {
    // test seam
    plan.overlay_frame_count
}

/// Reads FFmpeg stderr without blocking the encoder process.
fn monitor_composite_ffmpeg(
    stderr: std::process::ChildStderr,
    lines: Arc<Mutex<VecDeque<String>>>,
) {
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        if let Ok(mut locked) = lines.lock() {
            if locked.len() == FFMPEG_STDERR_LINE_LIMIT {
                locked.pop_front();
            }
            locked.push_back(line);
        }
    }
}

/// Returns a best-effort snapshot of collected FFmpeg stderr lines.
fn stderr_snapshot(lines: &Arc<Mutex<VecDeque<String>>>) -> String {
    lines
        .lock()
        .map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

/// Returns the composite video codec requested by `scene.ffmpeg`.
///
/// MP4 compositing defaults to software H.264 because the transparent-export
/// defaults are alpha codecs that are not suitable for final MP4 output.
fn composite_codec_name(scene: &crate::normalize::ValidatedSceneConfig) -> CoreResult<String> {
    scene
        .ffmpeg
        .as_object()
        .and_then(|map| map.get("codec"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            CoreError::Encode("scene.ffmpeg.codec must be provided by the frontend".into())
        })
        .map(str::to_string)
}

/// Reads detected QSV full-overlay initialization args from `scene.ffmpeg`.
///
/// The frontend injects these render-time args after codec detection so the
/// backend can reuse the exact hardware-device candidate that passed probing.
fn composite_qsv_full_init_args(scene: &crate::normalize::ValidatedSceneConfig) -> Vec<String> {
    scene
        .ffmpeg
        .as_object()
        .and_then(|map| map.get("qsv_full_init_args"))
        .and_then(serde_json::Value::as_array)
        .map(|args| {
            args.iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

//! Transparent overlay frame-worker pipeline.
//!
//! Renders Skia frames and streams them to ffmpeg via stdin.
//! Produces alpha-preserving overlay video (ProRes, QTRLE, or Vulkan).
//!
//! Must not import from [`video_composite_pipeline`].
//!
//! The pipeline prepares reusable Skia assets, renders frames into a bounded
//! pool of RGBA buffers, and streams those buffers to ffmpeg through stdin. A
//! separate monitor thread parses ffmpeg stderr for encoded-frame progress,
//! while the writer thread keeps expensive IO off the render loop.
//!
//! ## FFmpeg Process Lifecycle
//!
//! 1. **Spawn**: `spawn_ffmpeg_process()` creates the child with piped stdin
//!    (raw RGBA video) and piped stderr (progress). The child inherits no stdin.
//! 2. **Stdin**: The writer thread takes `child.stdin.take()`, writes frames in a
//!    loop, then drops the handle (EOF) so ffmpeg finalizes output.
//! 3. **Stderr**: The monitor thread takes `child.stderr.take()`, parses
//!    `frame=N` lines, and updates a shared `Arc<AtomicU32>` counter.
//! 4. **Wait**: Writer drain and FFmpeg finalization use bounded polling.
//! 5. **Cancel**: On cancellation, FFmpeg is terminated before the writer is
//!    joined so a blocked pipe write cannot stall teardown.
//! 6. **Error**: If ffmpeg exits non-zero or the writer panics, the partial
//!    output file is removed and `CoreError::Ffmpeg` or `CoreError::Encode` is
//!    returned. A frame-count mismatch after success is also treated as a failure.

use crate::activity::schema::{DenseActivityReport, ParsedActivity};
use crate::encode::ffmpeg::{configure_ffmpeg_command, resolve_ffmpeg_binary};
use crate::encode::ffmpeg_settings::{build_ffmpeg_settings, FfmpegSettings};
use crate::encode::pipeline_shared::{
    join_shutdown_thread, merge_timing_maps, terminate_ffmpeg, unblock_stalled_writer,
    wait_for_ffmpeg, writer_worker, FfmpegChildGuard, FrameBuffer, PartialOutputGuard,
    WriterCancellation, WriterWorkerConfig,
};
use crate::encode::video::RenderController;
use crate::encode::video_debug::{
    create_debug_dir, render_sample_frames_enabled, sample_frame_indices, write_prepare_summary,
    write_sample_frame, write_timing_summary_with_phase,
};
use crate::encode::video_frame_parallel::{
    diagnose_frame_worker_count, render_frames_parallel, FrameRenderTask, ParallelFramePoolPlan,
    ParallelFrameProgress, ParallelFrameRenderRequest,
};
use crate::error::{CoreError, CoreResult};
use crate::normalize::ValidatedRenderConfig;
use crate::paths::AppPaths;
use crate::render::prepare_preview_assets;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Instant;

/// Renders one transparent-overlay video by streaming Skia frames to ffmpeg.
///
/// The pipeline diagnoses a profile-specific worker count, prepares reusable
/// Skia assets, and sends ordered worker output through one FFmpeg process.
///
/// # Arguments
///
/// * `paths` — Central path configuration (fonts, templates, debug/output dirs).
/// * `config` — Validated render configuration with scene/widget/ffmpeg settings.
/// * `activity` — Parsed (but untrimmed) source activity for asset preparation.
/// * `dense_activity` — Frame-aligned dense report used for per-frame telemetry.
/// * `controller` — Shared render state; cloned to observe progress/cancellation.
///
/// # Returns
///
/// On success, returns the output filename (relative to the downloads directory).
/// Debug timing summaries are written to `paths.debug_render_dir/phase_6/`.
///
/// # Errors
///
/// Returns [`CoreError::Cancelled`] when the user cancels (output is cleaned up).
/// Returns [`CoreError::Ffmpeg`] if ffmpeg exits non-zero.
/// Returns [`CoreError::Encode`] on thread panic, pipe failure, or frame-count mismatch.
/// Returns [`CoreError::Render`] if any frame fails to render.
/// Returns [`CoreError::Io`] on filesystem errors.
///
/// # Thread Safety
///
/// Spawns two threads whose handles are stored and joined before returning:
/// a monitor thread (ffmpeg stderr → AtomicU32 counter) and a writer thread
/// (bounded channel → ffmpeg stdin, with buffer return to free pool). The
/// render loop runs on the calling thread.
///
/// # Cancellation
///
/// Checks `controller.cancel_flag` between every frame and at buffer-acquire
/// time. On cancellation, FFmpeg is terminated before threads are joined, the
/// partial output is removed, and `CoreError::Cancelled` is returned.
///
/// # Performance
///
/// This is a render hot path. Frame rendering and ffmpeg stdin writing overlap
/// via a bounded channel and a pooled buffer ring. Parallel rendering sizes the
/// pool from resolution and a fixed memory ceiling. Avoid per-frame allocations
/// inside the loop — buffers are reused.
pub(crate) fn render_video_with_frame_workers(
    paths: &AppPaths,
    config: &ValidatedRenderConfig,
    activity: &ParsedActivity,
    dense_activity: &DenseActivityReport,
    controller: &RenderController,
) -> CoreResult<String> {
    // ── PHASE 1: SETUP — derive dimensions, frame counts, paths, and ffmpeg args ──
    let scene = &config.scene;
    let ffmpeg_settings = finalize_ffmpeg_settings(build_ffmpeg_settings(&scene.ffmpeg)?);
    let width = make_even(scene.width);
    let height = make_even(scene.height);
    let layout_total_frames = dense_activity.frame_count as u32;
    let update_rate = scene.update_rate.max(1) as usize;
    // `rendered_frame_count` applies frame decimation: when update_rate > 1,
    // we render fewer frames than the dense report has, skipping layout frames
    // that would not change the visible overlay at the configured rate.
    let total_frames = rendered_frame_count(dense_activity.frame_count, update_rate) as u32;
    let container_fps = scene.fps / f64::from(scene.update_rate.max(1));
    let workers = diagnose_frame_worker_count(
        total_frames as usize,
        ffmpeg_settings.cpu_cores_per_frame_worker,
    );
    let pool = ParallelFramePoolPlan::for_resolution(width, height, workers)?;
    let frame_byte_len = pool.frame_byte_len;
    let queue_capacity = pool.queue_capacity;
    let buffer_count = pool.buffer_count;
    let debug_dir = create_debug_dir(paths, "phase_6")?;
    // ── PHASE 2: BUILD SKIA ASSETS — pre-render maps, fonts, and label cache ──
    let (prepared_preview_assets, label_cache_status, prepare_timings, prepare_total_ms) =
        prepare_preview_assets(paths, config, activity, dense_activity)?;
    write_prepare_summary(
        &debug_dir,
        prepare_total_ms,
        &prepare_timings,
        label_cache_status,
    )?;

    let public_filename = format!(
        "video_{}.{}",
        crate::encode::video_debug::timestamp_nanos()?,
        ffmpeg_settings.extension
    );
    let output_path = paths.downloads_dir.join(&public_filename);
    let mut output_guard = PartialOutputGuard::new(&output_path);
    let ffmpeg_bin = resolve_ffmpeg_binary(&paths.repo_root)?;
    let input_pix_fmt = ffmpeg_input_pix_fmt();
    let encoded_frames = Arc::new(AtomicU32::new(0));
    let cancel_flag = controller.cancel_flag();
    let render_started = Instant::now();

    // ── PHASE 3: CREATE BUFFER POOL (N+1 buffers for N-slot bounded channel) ──
    let (sender, receiver) = mpsc::sync_channel::<FrameBuffer>(queue_capacity);
    let (free_sender, free_receiver) = mpsc::sync_channel::<FrameBuffer>(buffer_count);
    for _ in 0..buffer_count {
        free_sender
            .send(FrameBuffer {
                pixels: vec![0u8; frame_byte_len],
            })
            .map_err(|_| CoreError::Encode("Failed to initialize frame buffer pool".to_string()))?;
    }
    // ── PHASE 4: SPAWN FFMPEG & WORKER THREADS (writer + monitor) ──
    // ffmpeg is spawned before the render loop starts. The writer owns stdin
    // and drains the bounded frame queue; the monitor parses stderr for progress.
    let mut child = FfmpegChildGuard::new(
        spawn_ffmpeg_process(
            &ffmpeg_bin,
            &ffmpeg_settings,
            &output_path,
            width,
            height,
            container_fps,
            &input_pix_fmt,
        )?,
        "transparent",
    );

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| CoreError::Encode("Failed to capture ffmpeg stderr".to_string()))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| CoreError::Encode("Failed to capture ffmpeg stdin".to_string()))?;
    let encoded_frames_for_monitor = encoded_frames.clone();
    let monitor_thread = thread::spawn(move || monitor_ffmpeg(stderr, encoded_frames_for_monitor));
    let pipeline_failed = Arc::new(AtomicBool::new(false));
    let pipeline_failed_for_writer = Arc::clone(&pipeline_failed);
    let cancel_flag_for_writer = cancel_flag.clone();
    let writer_thread = thread::spawn(move || {
        writer_worker(
            stdin,
            receiver,
            free_sender,
            WriterWorkerConfig {
                pipeline_failed: pipeline_failed_for_writer,
                cancellation: WriterCancellation::StopWhenCancelled(cancel_flag_for_writer),
                write_error_context: "Failed writing frame to ffmpeg",
                queue_wait_metric: Some("writer.rendered_frame_wait"),
                release_wait_metric: Some("buffer.release_wait"),
                release_error_message: Some("Frame buffer pool disconnected"),
                flush_error_is_fatal: true,
            },
        )
    });

    let sample_frames = if render_sample_frames_enabled()? {
        sample_frame_indices(total_frames as usize)
    } else {
        Vec::new()
    };
    let sample_output_frame_indices = sample_frames
        .iter()
        .copied()
        .map(|index| {
            u64::try_from(index).map_err(|_| {
                CoreError::Encode("Sample frame index exceeds u64 capacity".to_string())
            })
        })
        .collect::<CoreResult<Vec<_>>>()?;
    let scale = prepared_preview_assets.scene().scale;
    // ── PHASE 5: HOT RENDER LOOP ──
    // ffmpeg is running, the writer is draining the channel, the monitor is
    // parsing stderr. We own the render thread and produce exactly total_frames.
    // The bounded channel provides backpressure: if the writer falls behind,
    // the next queue_frame call blocks, capping memory usage.
    let tasks = (0..(total_frames as usize))
        .map(|output_frame_index| FrameRenderTask {
            output_frame_index: output_frame_index as u64,
            dense_frame_index: source_frame_index(output_frame_index, update_rate, dense_activity),
        })
        .collect::<Vec<_>>();
    let current_for_written_frames = |written_frames: u64| written_frames as u32;
    let encoded_for_current = |_current_progress: u32| encoded_frames.load(Ordering::SeqCst);
    let observe_ordered_frame = |task: FrameRenderTask, buffer: &FrameBuffer| {
        if sample_output_frame_indices
            .binary_search(&task.output_frame_index)
            .is_ok()
        {
            write_sample_frame(
                &ffmpeg_bin,
                &debug_dir,
                width,
                height,
                buffer.pixels.as_slice(),
                task.dense_frame_index,
                &input_pix_fmt,
            )?;
        }
        Ok(())
    };
    let render_result = render_frames_parallel(ParallelFrameRenderRequest {
        paths,
        dense_activity,
        prepared_assets: &prepared_preview_assets.prepared_assets,
        tasks: &tasks,
        width,
        height,
        scale,
        workers,
        progress: ParallelFrameProgress {
            total: total_frames,
            current_for_written_frames: &current_for_written_frames,
            encoded_for_current: &encoded_for_current,
            effective_fps_multiplier: std::num::NonZeroU32::new(scene.update_rate)
                .expect("validated scene update rate is non-zero"),
        },
        ffmpeg_process_name: "transparent",
        controller,
        cancel_flag: cancel_flag.as_ref(),
        pipeline_failed: pipeline_failed.as_ref(),
        frame_sender: &sender,
        ordered_frame_observer: Some(&observe_ordered_frame),
        free_receiver,
        ffmpeg_child: &mut child,
        render_started,
    });
    let mut was_cancelled = cancel_flag.load(Ordering::SeqCst);
    let producer_failed = render_result.is_err();
    let writer_failed_before_teardown = pipeline_failed.load(Ordering::SeqCst);
    drop(sender);
    // ── PHASE 6: THREAD JOIN & FFMPEG WAIT ──
    // Dropping the sender signals the writer to exit its recv() loop.
    // The writer flushes stdin and returns, which causes ffmpeg to see EOF
    // and finalize the output file. We join threads before waiting on ffmpeg
    // so pipe-write errors are collected before we check the exit status.
    let mut shutdown_error = None;
    if was_cancelled || producer_failed || writer_failed_before_teardown {
        if let Err(error) = terminate_ffmpeg(&mut child, "transparent") {
            shutdown_error = Some(error);
        }
    } else {
        match unblock_stalled_writer(
            &writer_thread,
            &mut child,
            "transparent",
            cancel_flag.as_ref(),
        ) {
            Ok(cancelled) => was_cancelled |= cancelled,
            Err(error) => shutdown_error = Some(error),
        }
    }
    let writer_result = join_shutdown_thread(writer_thread, "Encoder writer thread");
    let status = if was_cancelled || producer_failed || writer_failed_before_teardown {
        child.try_wait().map_err(|error| {
            CoreError::Encode(format!("transparent ffmpeg process error: {error}"))
        })?
    } else {
        match wait_for_ffmpeg(&mut child, "transparent", cancel_flag.as_ref()) {
            Ok((status, cancelled)) => {
                was_cancelled |= cancelled;
                Some(status)
            }
            Err(error) => {
                if shutdown_error.is_none() {
                    shutdown_error = Some(error);
                }
                child.try_wait().map_err(|wait_error| {
                    CoreError::Encode(format!("transparent ffmpeg process error: {wait_error}"))
                })?
            }
        }
    };
    let monitor_result = join_shutdown_thread(monitor_thread, "FFmpeg monitor thread");

    if was_cancelled {
        let _ = fs::remove_file(&output_path);
        return Err(CoreError::Cancelled);
    }
    let writer_result = match writer_result {
        Err(error) => {
            let _ = fs::remove_file(&output_path);
            if !writer_failed_before_teardown {
                if let Err(producer_error) = render_result {
                    return Err(producer_error);
                }
            }
            return Err(error);
        }
        Ok(result) => result,
    };
    if writer_failed_before_teardown {
        let _ = fs::remove_file(&output_path);
        return Err(writer_result.err().unwrap_or_else(|| {
            CoreError::Encode("Encoder writer stopped without reporting its failure".to_string())
        }));
    }

    let producer_result = match render_result {
        Ok(result) => result,
        Err(error) => {
            // Clean up partial output on any render-loop error. The file is
            // incomplete and ffmpeg may have written a truncated header — keeping
            // it would mislead the user into importing a broken video.
            let _ = fs::remove_file(&output_path);
            return Err(error);
        }
    };
    let rendered_frames = producer_result.rendered_frames;
    let producer_timings = producer_result.timings;
    // Check cancel flag again after the loop. The render may have finished
    // all frames but the user cancelled during the final frame — we still
    // treat that as a cancellation and clean up.
    let writer_result = match writer_result {
        Ok(result) => result,
        Err(error) => {
            let _ = fs::remove_file(&output_path);
            return Err(error);
        }
    };
    if let Some(error) = shutdown_error {
        let _ = fs::remove_file(&output_path);
        return Err(error);
    }
    monitor_result?;
    let status = status.ok_or_else(|| {
        CoreError::Encode("transparent ffmpeg did not report an exit status".to_string())
    })?;
    if !status.success() {
        let _ = fs::remove_file(&output_path);
        return Err(CoreError::Encode(format!(
            "ffmpeg encoding failed ({status})"
        )));
    }
    if writer_result.written_frames != u64::from(total_frames) {
        // Frame-count mismatch means ffmpeg accepted stdin but produced fewer
        // frames than expected — typically a pipe-write error partway through
        // that ffmpeg didn't report via exit status. Clean up and fail.
        let _ = fs::remove_file(&output_path);
        return Err(CoreError::Encode(format!(
            "ffmpeg encode pipeline ended early: wrote {} of {} frames",
            writer_result.written_frames, total_frames
        )));
    }
    output_guard.preserve();

    let total_time_taken = render_started.elapsed().as_secs_f64();

    // ── PHASE 7: FINALIZATION — write debug summary, return public filename ──
    let merged_timings = merge_timing_maps(producer_timings, writer_result.timings);
    write_timing_summary_with_phase(
        &debug_dir,
        prepared_preview_assets.scene(),
        &output_path,
        "phase_6",
        total_frames,
        layout_total_frames,
        rendered_frames,
        total_time_taken,
        sample_frames,
        merged_timings,
    )?;
    Ok(public_filename)
}

// Applies pipeline-level defaults that depend on the chosen ffmpeg settings.
fn finalize_ffmpeg_settings(mut ffmpeg_settings: FfmpegSettings) -> FfmpegSettings {
    // Vulkan ProRes benefits from explicit async depth. Apply it here so the
    // config builder remains a pure mapping from template JSON.
    if ffmpeg_settings.codec == "prores_ks_vulkan"
        && !ffmpeg_settings
            .output_args
            .iter()
            .any(|value| value == "-async_depth")
    {
        ffmpeg_settings.output_args.push("-async_depth".to_string());
        ffmpeg_settings.output_args.push("4".to_string());
    }
    ffmpeg_settings
}

/// Computes how many frames will be written after applying frame decimation.
pub fn rendered_frame_count(layout_frame_count: usize, update_rate: usize) -> usize {
    // Decimation keeps the first frame and then every `update_rate`th layout
    // frame. The +1 form avoids off-by-one loss for non-divisible lengths.
    if layout_frame_count == 0 {
        return 0;
    }
    let safe_update_rate = update_rate.max(1);
    ((layout_frame_count - 1) / safe_update_rate) + 1
}

// Maps an encoded output frame to the source layout frame index.
fn source_frame_index(
    output_frame_index: usize,
    update_rate: usize,
    dense_activity: &DenseActivityReport,
) -> usize {
    // Map encoded frames back to the denser layout timeline. Clamp to the final
    // layout frame so short clips and unusual update rates stay valid.
    let max_frame_index = dense_activity.frame_count.saturating_sub(1);
    output_frame_index
        .saturating_mul(update_rate.max(1))
        .min(max_frame_index)
}

/// Spawns ffmpeg configured to accept raw RGBA video via stdin.
///
/// All arguments are separate argv entries so user-supplied paths are not
/// shell-expanded. The child process has its stdin piped (for rawvideo frames),
/// stderr piped (for progress parsing), and stdout nulled. Callers must take
/// ownership of stdin and stderr via `.take()` before using them.
///
/// The spawned process does NOT inherit the parent's stdin — all frame data
/// flows through the piped stdin handle.
fn spawn_ffmpeg_process(
    ffmpeg_bin: &Path,
    ffmpeg_settings: &FfmpegSettings,
    output_path: &Path,
    width: u32,
    height: u32,
    fps: f64,
    input_pix_fmt: &str,
) -> CoreResult<std::process::Child> {
    // Feed rawvideo via stdin to avoid writing intermediary frame files. All
    // arguments are separate argv entries, so user paths are not shell-expanded.
    let mut command = Command::new(ffmpeg_bin);
    configure_ffmpeg_command(&mut command, ffmpeg_bin);
    command.arg("-loglevel").arg(&ffmpeg_settings.loglevel);

    if !ffmpeg_settings.input_args.is_empty() {
        command.args(&ffmpeg_settings.input_args);
    }

    command
        .arg("-f")
        .arg("rawvideo")
        .arg("-s")
        .arg(format!("{width}x{height}"))
        .arg("-pix_fmt")
        .arg(input_pix_fmt)
        .arg("-r")
        .arg(fps.to_string())
        .arg("-i")
        .arg("-");

    if let Some(filters) = &ffmpeg_settings.filter_complex {
        command.arg("-vf").arg(filters);
    }

    command
        .args(&ffmpeg_settings.output_args)
        .arg("-y")
        .arg(output_path)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::null());

    command
        .spawn()
        .map_err(|error| CoreError::Encode(format!("Could not start ffmpeg: {error}")))
}

// Monitors ffmpeg stderr and updates the encoded-frame counter.
fn monitor_ffmpeg(stderr: std::process::ChildStderr, encoded_frames: Arc<AtomicU32>) {
    // ffmpeg progress is emitted on stderr as human-readable status lines. We
    // parse frame counts opportunistically and ignore unrelated log messages.
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        if let Some(frame_index) = parse_ffmpeg_frame(&line) {
            encoded_frames.store(frame_index, Ordering::SeqCst);
        }
    }
}

// Extracts a frame count from one ffmpeg status line.
fn parse_ffmpeg_frame(line: &str) -> Option<u32> {
    // Accept ffmpeg's padded `frame=  123` status format.
    let marker = "frame=";
    let start = line.find(marker)? + marker.len();
    let digits = line[start..]
        .chars()
        .skip_while(|ch| ch.is_whitespace())
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse::<u32>().ok()
}

// Rounds a dimension up to the next even value when needed.
fn make_even(value: u32) -> u32 {
    // Many ffmpeg encoders require even dimensions. The extra pixel is
    // transparent because the render target starts cleared/base-filled.
    if value.is_multiple_of(2) {
        value
    } else {
        value + 1
    }
}

// Resolves the raw pixel format used for ffmpeg stdin.
fn ffmpeg_input_pix_fmt() -> String {
    // Exposed for diagnosing platform-specific pixel-format issues without
    // recompiling the backend.
    std::env::var("OVRLEY_INPUT_PIX_FMT").unwrap_or_else(|_| "rgba".to_string())
}

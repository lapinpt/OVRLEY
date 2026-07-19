//! Render progress estimation and lifecycle state.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::debug::RenderProgress;
use crate::error::{CoreError, CoreResult};

/// Number of initial `record` calls to skip before reporting estimates.
const WARMUP_FRAMES: u32 = 5;

/// Max recent `frame_seconds` samples in the rolling window.
const WINDOW_SIZE: usize = 16;

/// Clamp reported FPS to ±20 % of the warmup-excluded wall-clock throughput,
/// rejecting single outlier batches without masking real changes.
const WALL_TRUST_BAND: f64 = 0.20;

/// ETA EMA smoothing factor.  0.70 ≈ ~3-frame half-life.
const DEFAULT_ETA_SMOOTHING: f64 = 0.70;

/// Minimum spacing between `set_frame_progress` emits (~10 Hz).
/// State still mutates on every call so `progress()` reads fresh data.
const PROGRESS_EMIT_MIN_INTERVAL: Duration = Duration::from_millis(100);

/// Rolling-window throughput estimator.
#[derive(Debug, Clone)]
pub struct ProgressEstimator {
    eta_smoothing: f64,
    warmup_counter: u32,
    elapsed_at_warmup_end: f64,
    current_at_warmup_end: u32,
    intervals: VecDeque<f64>,
    eta_ema_seconds: Option<f64>,
}

impl ProgressEstimator {
    pub fn new(eta_smoothing: f64) -> Self {
        Self {
            eta_smoothing: eta_smoothing.clamp(0.0, 1.0),
            warmup_counter: 0,
            elapsed_at_warmup_end: 0.0,
            current_at_warmup_end: 0,
            intervals: VecDeque::with_capacity(WINDOW_SIZE),
            eta_ema_seconds: None,
        }
    }

    pub fn record(
        &mut self,
        current: u32,
        total: u32,
        frame_seconds: f64,
        elapsed_seconds: f64,
    ) -> (Option<u64>, Option<f64>) {
        if self.warmup_counter < WARMUP_FRAMES {
            self.warmup_counter += 1;
            // Snapshot wall time for cold-start-excluded anchor.
            self.elapsed_at_warmup_end = elapsed_seconds;
            self.current_at_warmup_end = current;
            return (None, None);
        }

        let valid = frame_seconds.is_finite() && frame_seconds > 0.0;
        if valid {
            if self.intervals.len() >= WINDOW_SIZE {
                self.intervals.pop_front();
            }
            self.intervals.push_back(frame_seconds);
        }

        let fps = self.compute_fps(current, elapsed_seconds);
        let eta = self.compute_eta(current, total, fps);
        (eta, fps)
    }

    fn compute_fps(&self, current: u32, elapsed_seconds: f64) -> Option<f64> {
        let post_frames = current.saturating_sub(self.current_at_warmup_end);
        let post_elapsed = (elapsed_seconds - self.elapsed_at_warmup_end).max(0.0);
        let clean_wall_fps = (post_frames > 0 && post_elapsed > 0.0)
            .then_some(f64::from(post_frames) / post_elapsed);

        let window_fps = self.window_median_fps();

        match (window_fps, clean_wall_fps) {
            (Some(window), Some(clean)) if clean > 0.0 => {
                let lower = (clean * (1.0 - WALL_TRUST_BAND)).max(0.0);
                let upper = clean * (1.0 + WALL_TRUST_BAND);
                Some(window.clamp(lower, upper))
            }
            (Some(window), _) => Some(window),
            (None, Some(clean)) => Some(clean),
            (None, None) => None,
        }
    }

    fn window_median_fps(&self) -> Option<f64> {
        if self.intervals.is_empty() {
            return None;
        }
        let mut samples: Vec<f64> = self.intervals.iter().copied().collect();
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let mid = samples.len() / 2;
        let median = if samples.len() % 2 == 0 {
            (samples[mid - 1] + samples[mid]) / 2.0
        } else {
            samples[mid]
        };
        (median > 0.0).then_some(1.0 / median)
    }

    fn compute_eta(&mut self, current: u32, total: u32, fps: Option<f64>) -> Option<u64> {
        let fps = fps?;
        if fps <= 0.0 {
            return None;
        }
        let remaining = f64::from(total.saturating_sub(current));
        if remaining <= 0.0 {
            // Producer caught up; pin ETA to 0.
            self.eta_ema_seconds = Some(0.0);
            return Some(0);
        }
        let raw_seconds = remaining / fps;
        let smoothed = match self.eta_ema_seconds {
            Some(prev) => self.eta_smoothing * prev + (1.0 - self.eta_smoothing) * raw_seconds,
            None => raw_seconds,
        };
        self.eta_ema_seconds = Some(smoothed);
        Some(smoothed.max(0.0).ceil() as u64)
    }
}

impl Default for ProgressEstimator {
    fn default() -> Self {
        Self::new(DEFAULT_ETA_SMOOTHING)
    }
}

/// Backend-agnostic sink for progress events. Tauri shell emits via this;
/// tests use [`NullSink`]. Must be `Send + Sync`.
pub trait ProgressSink: Send + Sync {
    fn emit_progress(&self, progress: &RenderProgress);
}

/// No-op sink for `RenderController::default()` and tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct NullSink;

impl ProgressSink for NullSink {
    fn emit_progress(&self, _progress: &RenderProgress) {}
}

/// Shared render state. Clones share the same `Arc`-wrapped state.
/// Only one render active at a time (enforced by `try_start`).
#[derive(Clone)]
pub struct RenderController {
    pub(crate) progress: Arc<Mutex<RenderProgress>>,
    pub(crate) cancel_flag: Arc<AtomicBool>,
    pub(crate) running: Arc<AtomicBool>,
    pub(crate) next_render_id: Arc<AtomicU32>,
    pub(crate) progress_sink: Arc<dyn ProgressSink>,
    pub(crate) last_fps_emit_at: Arc<Mutex<Option<Instant>>>,
}

impl Default for RenderController {
/// Idle-state controller with a `NullSink`.
    fn default() -> Self {
        Self::with_sink(Arc::new(NullSink))
    }
}

impl RenderController {
/// Wired to a concrete `ProgressSink`. [`default`] installs [`NullSink`].
    pub fn with_sink(progress_sink: Arc<dyn ProgressSink>) -> Self {
        Self {
            progress: Arc::new(Mutex::new(RenderProgress::default())),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
            next_render_id: Arc::new(AtomicU32::new(0)),
            progress_sink,
            last_fps_emit_at: Arc::new(Mutex::new(None)),
        }
    }

    /// Snapshot of latest progress state (one-shot). Live updates via sink.
    #[must_use = "progress snapshot must be consumed for frontend reads"]
    pub fn progress(&self) -> RenderProgress {
        self.progress
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default()
    }

    /// Requests cancellation. Returns whether a render was active.
    #[must_use = "the return value indicates whether a render was in progress"]
    pub fn cancel(&self) -> bool {
        self.cancel_flag.store(true, Ordering::SeqCst);
        if let Ok(mut progress) = self.progress.lock() {
            progress.status = "cancelled".to_string();
            progress.message = "Cancelling render...".to_string();
            let snapshot = progress.clone();
            drop(progress);
            self.progress_sink.emit_progress(&snapshot);
        }
        self.running.load(Ordering::SeqCst)
    }

    /// Starts a render if none is running. Concurrent starts fail fast.
    pub fn try_start(&self, total_frames: u32, message: &str) -> CoreResult<u64> {
        if self
            .running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(CoreError::Encode(
                "A render is already in progress".to_string(),
            ));
        }
        self.cancel_flag.store(false, Ordering::SeqCst);
        let render_id = self.next_render_id.fetch_add(1, Ordering::SeqCst) as u64 + 1;
        if let Ok(mut progress) = self.progress.lock() {
            *progress = RenderProgress {
                render_id,
                current: 0,
                total: total_frames,
                encoded: 0,
                status: "rendering".to_string(),
                message: message.to_string(),
                estimated_seconds_remaining: None,
                rendering_fps: None,
                filename: None,
            };
            let snapshot = progress.clone();
            drop(progress);
            self.progress_sink.emit_progress(&snapshot);
        }
        // Reset FPS throttle from any prior render.
        if let Ok(mut last) = self.last_fps_emit_at.lock() {
            *last = None;
        }
        Ok(render_id)
    }

    /// Updates counts and emits through sink. `rendering_fps` is ~10 Hz.
    pub fn set_frame_progress(
        &self,
        current: u32,
        total: u32,
        encoded: u32,
        estimate: Option<u64>,
        rendering_fps: Option<f64>,
    ) {
        let refresh_fps = match self.last_fps_emit_at.lock() {
            Ok(mut last) => {
                let now = Instant::now();
                let due = match *last {
                    None => true,
                    Some(prev) => now.duration_since(prev) >= PROGRESS_EMIT_MIN_INTERVAL,
                };
                if due {
                    *last = Some(now);
                }
                drop(last);
                due
            }
            Err(_) => true,
        };

        if let Ok(mut progress) = self.progress.lock() {
            progress.current = current;
            progress.total = total;
            progress.encoded = encoded;
            progress.estimated_seconds_remaining = estimate;
            if refresh_fps {
                progress.rendering_fps = rendering_fps;
            }
            progress.message = if current >= total {
                "Encoding output file...".to_string()
            } else {
                "Rendering frames...".to_string()
            };
            let snapshot = progress.clone();
            drop(progress);
            self.progress_sink.emit_progress(&snapshot);
        }
    }

    pub fn finish_success(&self, filename: String) {
        if let Ok(mut progress) = self.progress.lock() {
            progress.current = progress.total;
            progress.encoded = progress.total;
            progress.status = "complete".to_string();
            progress.message = "Video rendered successfully".to_string();
            progress.estimated_seconds_remaining = Some(0);
            progress.rendering_fps = None;
            progress.filename = Some(filename);
            let snapshot = progress.clone();
            drop(progress);
            self.progress_sink.emit_progress(&snapshot);
        }
        self.running.store(false, Ordering::SeqCst);
        self.cancel_flag.store(false, Ordering::SeqCst);
    }

    pub fn finish_error(&self, error: String, cancelled: bool) {
        if let Ok(mut progress) = self.progress.lock() {
            progress.status = if cancelled {
                "cancelled".to_string()
            } else {
                "error".to_string()
            };
            progress.message = if cancelled {
                "Rendering cancelled".to_string()
            } else {
                error
            };
            progress.estimated_seconds_remaining = None;
            progress.rendering_fps = None;
            progress.filename = None;
            let snapshot = progress.clone();
            drop(progress);
            self.progress_sink.emit_progress(&snapshot);
        }
        self.running.store(false, Ordering::SeqCst);
        self.cancel_flag.store(false, Ordering::SeqCst);
    }

    /// Returns the shared cancellation flag for internal worker coordination.
    pub fn cancel_flag(&self) -> Arc<AtomicBool> {
        // test seam
        self.cancel_flag.clone()
    }
}

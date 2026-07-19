//! Video encoding subsystem.
//!
//! The encoder receives already-densified activity data and rendered Skia
//! frames, streams raw RGBA pixels to ffmpeg, and records timing/debug output.
//! The public surface is intentionally small: callers start renders through the
//! controller in [`video`], while the pipeline modules feed ordered output from
//! profile-sized frame-worker pools into one ffmpeg process.
//!
//! ## Thread Map
//!
//! | Thread Type | Spawned By | Owns | Shutdown Signal | Joined By |
//! |-------------|------------|------|-----------------|-----------|
//! | Writer | Transparent/composite pipeline | ffmpeg stdin | Channel sender dropped (EOF) | Spawning function |
//! | Frame render worker | `render_frames_parallel` | Skia surface + RGBA buffer | Work queue exhaustion / shared stop flag | Frame coordinator |
//! | Monitor (transparent) | Transparent pipeline | ffmpeg stderr, `Arc<AtomicU32>` | ffmpeg exits → stderr EOF | Spawning function |
//! | Monitor (composite) | Composite pipeline | ffmpeg stderr, `Arc<Mutex<Vec>>` | ffmpeg exits → stderr EOF | Spawning function |
//! | Command dispatch | `backend_render` / composite render dispatcher | Full render call | Completion / cancel / error (updates controller) | Fire-and-forget |

/// Canonical codec/profile catalog shared by detection and FFmpeg builders.
pub mod codec_catalog;
/// ffmpeg codec and hardware-acceleration detection.
pub mod codec_detect;
/// ffmpeg discovery and codec argument construction.
pub mod ffmpeg;
/// FFmpeg argument construction for MP4 compositing mode.
pub mod ffmpeg_composite;
/// Editable FFmpeg command templates for composite encoder profiles.
pub mod ffmpeg_composite_profiles;
/// FFmpeg codec settings resolution (separated from binary discovery).
pub mod ffmpeg_settings;
/// Editable FFmpeg command templates for transparent overlay encoder profiles.
pub mod ffmpeg_transparent_profiles;
/// Rational frame-rate helpers shared by composite encoding modules.
pub mod fps;
/// Shared internal queueing and timing helpers for encode pipelines.
pub(crate) mod pipeline_shared;
/// Live render progress estimation helpers.
pub mod progress; // test seam
/// Render controller and public video render orchestration.
pub mod video;
/// Composite-only debug summaries for MP4 compositing diagnostics.
pub mod video_composite_debug; // test seam
/// Composite MP4 render pipeline used by the composite render entry point.
pub mod video_composite_pipeline; // test seam
/// Pure composite helper logic shared by production code and integration tests.
#[doc(hidden)]
pub mod video_composite_support;
/// Debug summaries and sample-frame exports.
mod video_debug;
/// Ordered parallel CPU frame production for a single FFmpeg process.
#[doc(hidden)]
pub mod video_frame_parallel;
/// Transparent frame-worker video pipeline.
pub(crate) mod video_pipeline;

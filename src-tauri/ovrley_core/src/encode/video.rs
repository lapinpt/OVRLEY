//! Render lifecycle orchestration facade.
//!
//! This module keeps the public encode entry points stable while delegating the
//! heavy lifting to the canonical transparent and composite frame-worker
//! pipelines.

use crate::activity::schema::{DenseActivityReport, ParsedActivity};
use crate::encode::video_composite_pipeline::render_composite_video_with_frame_workers;
use crate::encode::video_pipeline::render_video_with_frame_workers;
use crate::error::CoreResult;
use crate::normalize::ValidatedRenderConfig;
use crate::paths::AppPaths;

pub use crate::encode::progress::RenderController;
pub use crate::encode::video_pipeline::rendered_frame_count;

/// Renders a transparent overlay through the canonical frame-worker pipeline.
pub fn render_video(
    paths: &AppPaths,
    config: &ValidatedRenderConfig,
    activity: &ParsedActivity,
    dense_activity: &DenseActivityReport,
    controller: &RenderController,
) -> CoreResult<String> {
    render_video_with_frame_workers(paths, config, activity, dense_activity, controller)
}

/// Bundled parameters for composite MP4 rendering.
///
/// Fields such as `composite_render_duration` and `composite_video_trim_start`
/// are optional because callers that have already computed them from the render
/// plan can pass them directly, while the facade falls back to defaults derived
/// from `composite_video_duration`.
pub struct CompositeRenderRequest<'a> {
    pub paths: &'a AppPaths,
    pub config: &'a ValidatedRenderConfig,
    pub activity: &'a ParsedActivity,
    pub dense_activity: &'a DenseActivityReport,
    pub controller: &'a RenderController,
    pub composite_video_path: &'a str,
    pub composite_bitrate: &'a str,
    pub composite_sync_offset: f64,
    pub composite_video_fps_num: u32,
    pub composite_video_fps_den: u32,
    pub composite_video_duration: f64,
    pub composite_render_duration: f64,
    pub composite_video_trim_start: f64,
    pub composite_widget_update_rate: u32,
}

/// Renders an imported video with the Skia overlay composited into an MP4 output.
///
/// The selected codec profile and frame count determine the frame-worker count.
pub fn render_composite_video(request: &CompositeRenderRequest<'_>) -> CoreResult<String> {
    render_composite_video_with_frame_workers(
        request.paths,
        request.config,
        request.activity,
        request.dense_activity,
        request.controller,
        request.composite_video_path,
        request.composite_bitrate,
        request.composite_sync_offset,
        request.composite_video_fps_num,
        request.composite_video_fps_den,
        request.composite_video_duration,
        request.composite_render_duration,
        request.composite_video_trim_start,
        request.composite_widget_update_rate,
        true,
    )
}

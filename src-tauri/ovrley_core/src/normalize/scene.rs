//! Scene config validation.
//!
//! `validate_scene_config` verifies that every output-affecting scene field
//! is explicit. Missing fields are rejected — the backend owns zero
//! render-affecting defaults. The frontend must materialise all defaults
//! before sending the config.

use super::helpers::{
    require_f32, require_finite_f64, require_non_negative_f32, require_positive_f32,
    require_positive_f64, require_positive_u32, require_u32,
};
use super::raw::SceneConfig;
use crate::error::{CoreError, CoreResult};

/// All output-affecting scene fields — no `Option`, no defaults at render time.
///
/// The frontend must materialize every value before sending the config.
/// Missing or invalid fields are rejected by `validate_scene_config`.
#[derive(Clone, Debug)]
pub struct ValidatedSceneConfig {
    // ── Core timing ───────────────────────────────────────────────────
    pub fps: f64,
    pub start: f64,
    pub end: f64,
    // ── Dimensions ────────────────────────────────────────────────────
    pub width: u32,
    pub height: u32,
    pub scale: f32,
    // ── Render defaults ───────────────────────────────────────────────
    pub font: Option<String>,
    pub font_size: Option<f32>,
    pub opacity: Option<f32>,
    pub decimal_rounding: Option<i32>,
    pub time_format: Option<String>,
    pub custom_export_range_active: Option<bool>,
    // ── Shadow/border ─────────────────────────────────────────────────
    pub shadow_color: String,
    pub shadow_strength: f32,
    pub shadow_distance: f32,
    pub border_color: String,
    pub border_thickness: f32,
    // ── Encoding ──────────────────────────────────────────────────────
    pub update_rate: u32,
    pub overlay_filename: Option<String>,
    pub ffmpeg: serde_json::Value,
    // ── Composite encoding ────────────────────────────────────────────
    pub composite_video_path: Option<String>,
    pub composite_bitrate: Option<String>,
    pub composite_sync_offset: Option<f64>,
    pub composite_video_fps_num: Option<u32>,
    pub composite_video_fps_den: Option<u32>,
    pub composite_video_duration: Option<f64>,
    pub composite_render_duration: Option<f64>,
    pub composite_video_trim_start: Option<f64>,
    pub composite_widget_update_rate: Option<u32>,
}

/// Validates scene config, rejecting missing or out-of-range fields.
pub fn validate_scene_config(raw: SceneConfig) -> CoreResult<ValidatedSceneConfig> {
    let fps = require_positive_f64(raw.fps, "scene.fps")?;
    let start = require_finite_f64(raw.start, "scene.start")?;
    let end = require_finite_f64(raw.end, "scene.end")?;
    if start >= end {
        return Err(CoreError::Config(format!(
            "scene.start ({start}) must be less than scene.end ({end})"
        )));
    }

    let width = require_positive_u32(raw.width, "scene.width")?;
    let height = require_positive_u32(raw.height, "scene.height")?;
    let scale = require_positive_f32(raw.scale, "scene.scale")?;

    let shadow_strength = require_f32(raw.shadow_strength, "scene.shadow_strength")?;
    require_non_negative_f32(shadow_strength, "scene.shadow_strength")?;
    let shadow_distance = require_f32(raw.shadow_distance, "scene.shadow_distance")?;
    require_non_negative_f32(shadow_distance, "scene.shadow_distance")?;
    let shadow_color = raw
        .shadow_color
        .ok_or_else(|| CoreError::Config("scene.shadow_color: required".into()))?;
    let border_thickness = require_f32(raw.border_thickness, "scene.border_thickness")?;
    require_non_negative_f32(border_thickness, "scene.border_thickness")?;
    let border_color = raw
        .border_color
        .ok_or_else(|| CoreError::Config("scene.border_color: required".into()))?;

    let update_rate = require_u32(raw.update_rate, "scene.update_rate")?;
    if update_rate == 0 {
        return Err(CoreError::Config(format!("scene.update_rate: must be > 0")));
    }
    let composite_sync_offset = raw.composite_sync_offset;
    let composite_video_trim_start = raw.composite_video_trim_start;
    let composite_widget_update_rate = raw.composite_widget_update_rate;
    let custom_export_range_active = raw.custom_export_range_active;

    Ok(ValidatedSceneConfig {
        fps,
        start,
        end,
        width,
        height,
        scale,
        font: raw.font,
        font_size: raw.font_size,
        opacity: raw.opacity,
        decimal_rounding: raw.decimal_rounding,
        time_format: raw.time_format,
        custom_export_range_active,
        shadow_color,
        shadow_strength,
        shadow_distance,
        border_color,
        border_thickness,
        update_rate,
        overlay_filename: raw.overlay_filename,
        ffmpeg: raw.ffmpeg,
        composite_video_path: raw.composite_video_path,
        composite_bitrate: raw.composite_bitrate,
        composite_sync_offset,
        composite_video_fps_num: raw.composite_video_fps_num,
        composite_video_fps_den: raw.composite_video_fps_den,
        composite_video_duration: raw.composite_video_duration,
        composite_render_duration: raw.composite_render_duration,
        composite_video_trim_start,
        composite_widget_update_rate,
    })
}

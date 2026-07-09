//! Arc gauge metric widget validation.
//!
//! Arc gauges share metric formatting with text widgets, but render that value
//! inside a circular stroked track. The validator keeps every visual input
//! explicit and rejects out-of-range arc geometry before render preparation.

use super::helpers::{require_bool, require_f32, require_string};
use super::raw::ValueConfig;
use super::value::validate_arc_inner_value_widget;
use super::ValidatedValueWidget;
use crate::error::{CoreError, CoreResult};
use crate::types::{DisplayType, MetricKind};

pub const MIN_ARC_ANGLE_DEGREES: f32 = 30.0;
pub const MAX_ARC_ANGLE_DEGREES: f32 = 360.0;

/// Fully validated arc gauge configuration.
#[derive(Clone, Debug)]
pub struct ValidatedArcGaugeWidget {
    pub metric: MetricKind,
    pub x: f32,
    pub y: f32,
    pub width: u32,
    pub height: u32,
    pub rotation: f32,
    pub display_type: DisplayType,
    pub arc_angle: f32,
    pub inner_widget_offset_x: f32,
    pub inner_widget_offset_y: f32,
    pub track_thickness: f32,
    pub track_corner_radius: f32,
    pub track_border_thickness: f32,
    pub track_border_color: String,
    pub track_empty_color: String,
    pub track_empty_opacity: f32,
    pub track_filled_color: String,
    pub track_filled_opacity: f32,
    pub show_min_max_labels: bool,
    pub min_max_label_font: String,
    pub min_max_label_font_size: f32,
    pub min_max_label_color: String,
    /// Shared text formatting and styling for the inner value/unit stack.
    /// `show_icon` is always false for this presentation.
    pub inner_value: ValidatedValueWidget,
}

/// Validates a raw value config as an arc gauge.
pub fn validate_arc_gauge(value: ValueConfig, index: usize) -> CoreResult<ValidatedArcGaugeWidget> {
    let p = |field: &str| format!("values[{index}].{field}");

    if value.display_type != DisplayType::Arc {
        return Err(CoreError::Config(format!(
            "{}: expected arc display_type, got '{}'",
            p("display_type"),
            value.display_type.as_str()
        )));
    }

    let width = value
        .width
        .ok_or_else(|| CoreError::Config(format!("{}: required", p("width"))))?;
    let height = value
        .height
        .ok_or_else(|| CoreError::Config(format!("{}: required", p("height"))))?;
    if width == 0 {
        return Err(CoreError::Config(format!("{}: must be > 0", p("width"))));
    }
    if height == 0 {
        return Err(CoreError::Config(format!("{}: must be > 0", p("height"))));
    }

    let arc_angle = require_f32(value.arc_angle, &p("arc_angle"))?;
    if !(MIN_ARC_ANGLE_DEGREES..=MAX_ARC_ANGLE_DEGREES).contains(&arc_angle) {
        return Err(CoreError::Config(format!(
            "{}: must be {}..={}, got {arc_angle}",
            p("arc_angle"),
            MIN_ARC_ANGLE_DEGREES as u32,
            MAX_ARC_ANGLE_DEGREES as u32,
        )));
    }

    let track_thickness = require_f32(value.track_thickness, &p("track_thickness"))?;
    if track_thickness <= 0.0 {
        return Err(CoreError::Config(format!(
            "{}: must be > 0, got {track_thickness}",
            p("track_thickness")
        )));
    }

    let raw_corner_radius = require_f32(value.track_corner_radius, &p("track_corner_radius"))?;
    if raw_corner_radius < 0.0 {
        return Err(CoreError::Config(format!(
            "{}: must be >= 0, got {raw_corner_radius}",
            p("track_corner_radius")
        )));
    }
    // Arc tracks use a filled outline with endpoint fillets. Keep the shared
    // radius contract bounded by the track half-width, matching linear gauges.
    let track_corner_radius = raw_corner_radius.min(track_thickness * 0.5);

    let track_border_thickness =
        require_f32(value.track_border_thickness, &p("track_border_thickness"))?;
    if track_border_thickness < 0.0 {
        return Err(CoreError::Config(format!(
            "{}: must be >= 0, got {track_border_thickness}",
            p("track_border_thickness")
        )));
    }

    let track_empty_opacity = require_f32(value.track_empty_opacity, &p("track_empty_opacity"))?;
    let track_filled_opacity = require_f32(value.track_filled_opacity, &p("track_filled_opacity"))?;
    for (field, opacity) in [
        ("track_empty_opacity", track_empty_opacity),
        ("track_filled_opacity", track_filled_opacity),
    ] {
        if !(0.0..=1.0).contains(&opacity) {
            return Err(CoreError::Config(format!(
                "{}: must be 0.0..1.0, got {opacity}",
                p(field)
            )));
        }
    }

    let min_max_label_font_size =
        require_f32(value.min_max_label_font_size, &p("min_max_label_font_size"))?;
    if min_max_label_font_size <= 0.0 {
        return Err(CoreError::Config(format!(
            "{}: must be > 0, got {min_max_label_font_size}",
            p("min_max_label_font_size")
        )));
    }

    let metric = value.value;
    let x = value.x;
    let y = value.y;
    let rotation = value.rotation.unwrap_or(0.0);
    let inner_widget_offset_x =
        require_f32(value.inner_widget_offset_x, &p("inner_widget_offset_x"))?;
    let inner_widget_offset_y =
        require_f32(value.inner_widget_offset_y, &p("inner_widget_offset_y"))?;
    let track_border_color =
        require_string(value.track_border_color.clone(), &p("track_border_color"))?;
    let track_empty_color =
        require_string(value.track_empty_color.clone(), &p("track_empty_color"))?;
    let track_filled_color =
        require_string(value.track_filled_color.clone(), &p("track_filled_color"))?;
    let show_min_max_labels = require_bool(value.show_min_max_labels, &p("show_min_max_labels"))?;
    let min_max_label_font =
        require_string(value.min_max_label_font.clone(), &p("min_max_label_font"))?;
    let min_max_label_color =
        require_string(value.min_max_label_color.clone(), &p("min_max_label_color"))?;

    let inner_value = validate_arc_inner_value_widget(value, index)?;

    Ok(ValidatedArcGaugeWidget {
        metric,
        x,
        y,
        width,
        height,
        rotation,
        display_type: DisplayType::Arc,
        arc_angle,
        inner_widget_offset_x,
        inner_widget_offset_y,
        track_thickness,
        track_corner_radius,
        track_border_thickness,
        track_border_color,
        track_empty_color,
        track_empty_opacity,
        track_filled_color,
        track_filled_opacity,
        show_min_max_labels,
        min_max_label_font,
        min_max_label_font_size,
        min_max_label_color,
        inner_value,
    })
}

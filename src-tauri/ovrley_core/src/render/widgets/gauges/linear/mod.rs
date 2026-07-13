//! Linear gauge metric widget rendering.
//!
//! Handles the linear gauge presentation: a filled bar track with optional
//! border, rounded corners, and min/max labels. The static layer (track
//! background + border + labels) is pre-rendered into a cached image; the
//! dynamic filled portion is drawn per-frame on top.

use super::labels::format_gauge_label;
use super::range::{
    bar_fill_count, fill_percentage as shared_fill_percentage, metric_range, metric_values,
};
use crate::activity::schema::DenseActivityReport;
use crate::debug::RenderProfiler;
use crate::error::CoreResult;
use crate::normalize::{
    ValidatedLinearGaugeLabelPosition, ValidatedLinearGaugeOrientation, ValidatedLinearGaugeWidget,
    ValidatedSceneConfig,
};
use crate::render::surface::create_surface;
use crate::render::text::{origin_x_for_centered_text, parse_color, resolve_font};
use crate::render::widgets::common::{normalize_shadow_style_validated, static_layer_padding};
use crate::render::widgets::types::{
    LinearGaugeCache, LinearGaugeFrameState, WidgetFrameReport, WidgetGeometryReport,
    WidgetRenderReport,
};
use crate::types::{DisplayType, TrackFillStyle};
use skia_safe::{
    image_filters, BlendMode, Canvas, Paint, PathBuilder, PathFillType, Point, RRect, Rect,
};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinearGaugeOrientation {
    Horizontal,
    Vertical,
}

const LINEAR_GAUGE_LABEL_GAP_PX: f32 = 8.0;

#[derive(Clone, Debug)]
struct LinearGaugeLabelLayout {
    min_label: String,
    max_label: String,
    min_origin: Point,
    max_origin: Point,
}

fn linear_gauge_label_gap(font_size: f32) -> f32 {
    (font_size * 0.35).max(LINEAR_GAUGE_LABEL_GAP_PX)
}

impl From<ValidatedLinearGaugeOrientation> for LinearGaugeOrientation {
    fn from(value: ValidatedLinearGaugeOrientation) -> Self {
        match value {
            ValidatedLinearGaugeOrientation::Horizontal => Self::Horizontal,
            ValidatedLinearGaugeOrientation::Vertical => Self::Vertical,
        }
    }
}

/// Backwards-compatible public entry point for the shared gauge range helper.
pub fn fill_percentage(value: f64, min: f64, max: f64) -> f32 {
    shared_fill_percentage(value, min, max)
}

/// Computes the filled-bar rect without border insetting.
pub fn bar_fill_rect(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    fill01: f32,
    orientation: LinearGaugeOrientation,
) -> (f32, f32, f32, f32) {
    let fill01 = fill01.clamp(0.0, 1.0);
    match orientation {
        LinearGaugeOrientation::Horizontal => (x, y, width * fill01, height),
        LinearGaugeOrientation::Vertical => {
            let filled_height = height * fill01;
            (x, y + height - filled_height, width, filled_height)
        }
    }
}

/// Computes the filled-bar rect, inset by the border thickness.
pub fn bordered_bar_fill_rect(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    fill01: f32,
    orientation: LinearGaugeOrientation,
    border_thickness: f32,
) -> (f32, f32, f32, f32) {
    let inset = border_thickness.max(0.0);
    let inner_width = (width - inset * 2.0).max(0.0);
    let inner_height = (height - inset * 2.0).max(0.0);
    bar_fill_rect(
        x + inset,
        y + inset,
        inner_width,
        inner_height,
        fill01,
        orientation,
    )
}

/// Prepares a pre-rendered static image and per-frame fill states for a
/// linear gauge widget. The static layer (track background, border, labels)
/// is drawn once; the dynamic filled bar is composited per-frame.
pub fn prepare_linear_gauge_cache(
    gauge: &ValidatedLinearGaugeWidget,
    dense_activity: &DenseActivityReport,
    scene: &ValidatedSceneConfig,
    scale: f32,
    font_dirs: &[PathBuf],
    prepare_profiler: &mut RenderProfiler,
) -> CoreResult<LinearGaugeCache> {
    prepare_profiler.measure("gauge.linear.prepare", || {
        let scaled_width = ((gauge.width as f32) * scale).round().max(1.0) as u32;
        let scaled_height = ((gauge.height as f32) * scale).round().max(1.0) as u32;
        let (min_value, max_value) = metric_range(&dense_activity.series, gauge.metric);
        let shadow = normalize_shadow_style_validated(
            &scene.shadow_color,
            scene.shadow_strength,
            scene.shadow_distance,
            scale,
        );
        let track_padding =
            static_layer_padding(gauge.track_border_thickness * scale, shadow.as_ref());
        let (label_left, label_top, label_right, label_bottom) = linear_gauge_label_padding(
            gauge,
            scaled_width,
            scaled_height,
            scale,
            font_dirs,
            min_value,
            max_value,
        )?;
        let left_padding = track_padding.max(label_left);
        let top_padding = track_padding.max(label_top);
        let right_padding = track_padding.max(label_right);
        let bottom_padding = track_padding.max(label_bottom);
        let layer_width = scaled_width
            .saturating_add(left_padding)
            .saturating_add(right_padding)
            .max(1);
        let layer_height = scaled_height
            .saturating_add(top_padding)
            .saturating_add(bottom_padding)
            .max(1);
        let frame_states = metric_values(&dense_activity.series, gauge.metric)
            .iter()
            .map(|value| {
                let value = value.unwrap_or(min_value);
                LinearGaugeFrameState {
                    value,
                    fill01: fill_percentage(value, min_value, max_value),
                }
            })
            .collect::<Vec<_>>();

        let mut surface = create_surface(layer_width, layer_height)?;
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::TRANSPARENT);
        canvas.translate((left_padding as f32, top_padding as f32));
        draw_static_linear_layer(
            canvas,
            gauge,
            scene,
            scaled_width,
            scaled_height,
            scale,
            font_dirs,
            min_value,
            max_value,
        )?;

        Ok(LinearGaugeCache {
            static_image: surface.image_snapshot(),
            static_image_x: gauge.x - left_padding as f32,
            static_image_y: gauge.y - top_padding as f32,
            x: gauge.x,
            y: gauge.y,
            width: scaled_width,
            height: scaled_height,
            rotation: gauge.rotation,
            display_type: DisplayType::Linear,
            orientation: gauge.orientation,
            track_corner_radius: gauge.track_corner_radius * scale,
            track_border_thickness: gauge.track_border_thickness * scale,
            track_filled_color: gauge.track_filled_color.clone(),
            track_filled_opacity: gauge.track_filled_opacity,
            track_fill_flat: gauge.track_fill_flat,
            track_fill_style: gauge.track_fill_style,
            bar_geometry: crate::normalize::scale_bar_geometry(gauge.bar_geometry, scale),
            min_value,
            max_value,
            frame_states,
        })
    })
}

/// Draws the linear gauge for a single frame: paints the pre-rendered static
/// image, then composites the filled bar on top using the frame's fill state.
pub fn draw_linear_gauge_widget(
    canvas: &Canvas,
    cache: &LinearGaugeCache,
    frame_index: usize,
    frame_profiler: &mut RenderProfiler,
) -> Option<WidgetRenderReport> {
    if cache.display_type != DisplayType::Linear {
        return None;
    }

    frame_profiler.measure("gauge.linear.draw", || {
        canvas.draw_image(
            &cache.static_image,
            (cache.static_image_x, cache.static_image_y),
            None,
        );

        let state = cache
            .frame_states
            .get(frame_index)
            .or_else(|| cache.frame_states.last())?;
        if cache.track_fill_style == TrackFillStyle::Bars {
            draw_segmented_linear_fill(canvas, cache, state.fill01);
        } else {
            draw_continuous_linear_fill(canvas, cache, state.fill01);
        }

        Some(WidgetRenderReport {
            geometry: WidgetGeometryReport {
                point_count: 0,
                source_point_count: 0,
                simplification: "linear_gauge".to_string(),
                bbox: [cache.x, cache.y, cache.width as f32, cache.height as f32],
                widget_width: cache.width,
                widget_height: cache.height,
                rotation_deg: cache.rotation,
            },
            frame: WidgetFrameReport {
                progress01: state.fill01,
                marker_x: cache.width as f32 * state.fill01,
                marker_y: cache.height as f32 * (1.0 - state.fill01),
                marker_abs_x: cache.x + cache.width as f32 * state.fill01,
                marker_abs_y: cache.y + cache.height as f32 * (1.0 - state.fill01),
            },
        })
    })
}

fn draw_static_linear_layer(
    canvas: &Canvas,
    gauge: &ValidatedLinearGaugeWidget,
    scene: &ValidatedSceneConfig,
    width: u32,
    height: u32,
    scale: f32,
    font_dirs: &[PathBuf],
    min_value: f64,
    max_value: f64,
) -> CoreResult<()> {
    let w = width as f32;
    let h = height as f32;
    let radius = gauge.track_corner_radius * scale;
    let border = gauge.track_border_thickness * scale;

    let shadow_filter = if border > 0.0 {
        normalize_shadow_style_validated(
            &scene.shadow_color,
            scene.shadow_strength,
            scene.shadow_distance,
            scale,
        )
        .and_then(|shadow| {
            image_filters::drop_shadow_only(
                (shadow.offset_x, shadow.offset_y),
                (shadow.strength, shadow.strength),
                parse_color(&shadow.color, 1.0),
                None,
                None,
                None,
            )
        })
    } else {
        None
    };

    if let Some(bar_geometry) = gauge.bar_geometry {
        for index in 0..bar_geometry.count {
            let rect = linear_segment_rect(
                index,
                bar_geometry.extent * scale,
                bar_geometry.gap * scale,
                w,
                h,
                gauge.orientation,
            );
            draw_static_linear_track(canvas, gauge, rect, radius, border, shadow_filter.as_ref());
        }
    } else {
        draw_static_linear_track(
            canvas,
            gauge,
            Rect::from_xywh(0.0, 0.0, w, h),
            radius,
            border,
            shadow_filter.as_ref(),
        );
    }

    if gauge.show_min_max_labels {
        let font_size = gauge.min_max_label_font_size * scale;
        let font = resolve_font(font_dirs, Some(&gauge.min_max_label_font), font_size)?;
        let layout =
            linear_gauge_label_layout(gauge, width, height, scale, &font, min_value, max_value);
        let mut text_paint = Paint::default();
        text_paint.set_anti_alias(true);
        text_paint.set_color(parse_color(&gauge.min_max_label_color, 1.0));
        canvas.draw_str(&layout.min_label, layout.min_origin, &font, &text_paint);
        canvas.draw_str(&layout.max_label, layout.max_origin, &font, &text_paint);
    }

    Ok(())
}

fn linear_segment_rect(
    index: u32,
    extent: f32,
    gap: f32,
    width: f32,
    height: f32,
    orientation: ValidatedLinearGaugeOrientation,
) -> Rect {
    match orientation {
        ValidatedLinearGaugeOrientation::Horizontal => {
            Rect::from_xywh(index as f32 * (extent + gap), 0.0, extent, height)
        }
        ValidatedLinearGaugeOrientation::Vertical => Rect::from_xywh(
            0.0,
            height - extent - index as f32 * (extent + gap),
            width,
            extent,
        ),
    }
}

fn draw_static_linear_track(
    canvas: &Canvas,
    gauge: &ValidatedLinearGaugeWidget,
    rect: Rect,
    configured_radius: f32,
    border: f32,
    shadow_filter: Option<&skia_safe::ImageFilter>,
) {
    let radius = configured_radius
        .min(rect.width() * 0.5)
        .min(rect.height() * 0.5);
    let outer_rrect = RRect::new_rect_xy(rect, radius, radius);
    let inner_rect = Rect::from_xywh(
        rect.left + border,
        rect.top + border,
        (rect.width() - border * 2.0).max(0.0),
        (rect.height() - border * 2.0).max(0.0),
    );
    let inner_radius = (radius - border).max(0.0);
    let inner_rrect = RRect::new_rect_xy(inner_rect, inner_radius, inner_radius);

    if let Some(filter) = shadow_filter {
        let mut shadow_paint = Paint::default();
        shadow_paint.set_anti_alias(true);
        shadow_paint.set_color(skia_safe::Color::BLACK);
        shadow_paint.set_image_filter(filter.clone());
        if border > 0.0 {
            let mut ring_path = PathBuilder::new_with_fill_type(PathFillType::EvenOdd);
            ring_path.add_rrect(outer_rrect, None, None);
            ring_path.add_rrect(inner_rrect, None, None);
            canvas.draw_path(&ring_path.detach(), &shadow_paint);
        } else {
            canvas.draw_rrect(outer_rrect, &shadow_paint);
        }
    }

    if border > 0.0 {
        let mut border_paint = Paint::default();
        border_paint.set_anti_alias(true);
        border_paint.set_color(parse_color(&gauge.track_border_color, 1.0));
        canvas.draw_rrect(outer_rrect, &border_paint);

        let mut clear_paint = Paint::default();
        clear_paint.set_anti_alias(true);
        clear_paint.set_blend_mode(BlendMode::Clear);
        canvas.draw_rrect(inner_rrect, &clear_paint);
    }

    let mut empty_paint = Paint::default();
    empty_paint.set_anti_alias(true);
    empty_paint.set_color(parse_color(
        &gauge.track_empty_color,
        gauge.track_empty_opacity,
    ));
    canvas.draw_rrect(inner_rrect, &empty_paint);
}

fn draw_segmented_linear_fill(canvas: &Canvas, cache: &LinearGaugeCache, fill01: f32) {
    let bar_geometry = cache
        .bar_geometry
        .expect("bars fill style must carry resolved bar geometry");
    let filled_count = bar_fill_count(fill01, bar_geometry.count);
    let paint = linear_fill_paint(cache);

    for index in 0..filled_count as u32 {
        let outer = linear_segment_rect(
            index,
            bar_geometry.extent,
            bar_geometry.gap,
            cache.width as f32,
            cache.height as f32,
            cache.orientation,
        );
        let border = cache.track_border_thickness;
        let inner = Rect::from_xywh(
            cache.x + outer.left + border,
            cache.y + outer.top + border,
            (outer.width() - border * 2.0).max(0.0),
            (outer.height() - border * 2.0).max(0.0),
        );
        let radius = (cache.track_corner_radius - border)
            .max(0.0)
            .min(inner.width() * 0.5)
            .min(inner.height() * 0.5);
        canvas.draw_rrect(RRect::new_rect_xy(inner, radius, radius), &paint);
    }
}

fn draw_continuous_linear_fill(canvas: &Canvas, cache: &LinearGaugeCache, fill01: f32) {
    let (x, y, width, height) = bordered_bar_fill_rect(
        cache.x,
        cache.y,
        cache.width as f32,
        cache.height as f32,
        fill01,
        cache.orientation.into(),
        cache.track_border_thickness,
    );
    if width <= 0.0 || height <= 0.0 {
        return;
    }

    let fill_paint = linear_fill_paint(cache);
    let fill_rect = Rect::from_xywh(x, y, width, height);
    let radius = (cache.track_corner_radius - cache.track_border_thickness).max(0.0);
    if radius == 0.0 {
        canvas.draw_rrect(RRect::new_rect_xy(fill_rect, radius, radius), &fill_paint);
        return;
    }

    let inset = cache.track_border_thickness.max(0.0);
    let inner_rect = Rect::from_xywh(
        cache.x + inset,
        cache.y + inset,
        (cache.width as f32 - inset * 2.0).max(0.0),
        (cache.height as f32 - inset * 2.0).max(0.0),
    );
    let inner_rrect = RRect::new_rect_xy(inner_rect, radius, radius);
    canvas.save();
    if cache.track_fill_flat {
        canvas.clip_rect(fill_rect, skia_safe::ClipOp::Intersect, true);
        canvas.draw_rrect(inner_rrect, &fill_paint);
    } else {
        canvas.clip_rrect(inner_rrect, skia_safe::ClipOp::Intersect, true);
        canvas.draw_rrect(
            RRect::new_rect_xy(fill_rect, radius.min(width * 0.5), radius.min(height * 0.5)),
            &fill_paint,
        );
    }
    canvas.restore();
}

fn linear_fill_paint(cache: &LinearGaugeCache) -> Paint {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(parse_color(
        &cache.track_filled_color,
        cache.track_filled_opacity,
    ));
    paint
}

fn linear_gauge_label_padding(
    gauge: &ValidatedLinearGaugeWidget,
    width: u32,
    height: u32,
    scale: f32,
    font_dirs: &[PathBuf],
    min_value: f64,
    max_value: f64,
) -> CoreResult<(u32, u32, u32, u32)> {
    if !gauge.show_min_max_labels {
        return Ok((0, 0, 0, 0));
    }

    let font_size = gauge.min_max_label_font_size * scale;
    let font = resolve_font(font_dirs, Some(&gauge.min_max_label_font), font_size)?;
    let layout =
        linear_gauge_label_layout(gauge, width, height, scale, &font, min_value, max_value);
    let (_, min_bounds) = font.measure_str(&layout.min_label, None);
    let (_, max_bounds) = font.measure_str(&layout.max_label, None);

    let min_left = layout.min_origin.x + min_bounds.left;
    let min_top = layout.min_origin.y + min_bounds.top;
    let min_right = layout.min_origin.x + min_bounds.right;
    let min_bottom = layout.min_origin.y + min_bounds.bottom;
    let max_left = layout.max_origin.x + max_bounds.left;
    let max_top = layout.max_origin.y + max_bounds.top;
    let max_right = layout.max_origin.x + max_bounds.right;
    let max_bottom = layout.max_origin.y + max_bounds.bottom;

    let left = min_left.min(max_left);
    let top = min_top.min(max_top);
    let right = min_right.max(max_right);
    let bottom = min_bottom.max(max_bottom);

    Ok((
        (-left).max(0.0).ceil() as u32,
        (-top).max(0.0).ceil() as u32,
        (right - width as f32).max(0.0).ceil() as u32,
        (bottom - height as f32).max(0.0).ceil() as u32,
    ))
}

fn linear_gauge_label_layout(
    gauge: &ValidatedLinearGaugeWidget,
    width: u32,
    height: u32,
    scale: f32,
    font: &skia_safe::Font,
    min_value: f64,
    max_value: f64,
) -> LinearGaugeLabelLayout {
    let w = width as f32;
    let h = height as f32;
    let gap = linear_gauge_label_gap(gauge.min_max_label_font_size * scale);
    let min_label = format_linear_gauge_label(min_value);
    let max_label = format_linear_gauge_label(max_value);
    let (_, metrics) = font.metrics();
    let (_, min_bounds) = font.measure_str(&min_label, None);
    let (_, max_bounds) = font.measure_str(&max_label, None);

    match (gauge.orientation, gauge.min_max_label_position) {
        (ValidatedLinearGaugeOrientation::Horizontal, ValidatedLinearGaugeLabelPosition::Top) => {
            let baseline = -gap - metrics.descent;
            LinearGaugeLabelLayout {
                min_label: min_label.clone(),
                max_label: max_label.clone(),
                min_origin: Point::new(origin_x_for_centered_text(&min_label, 0.0, font), baseline),
                max_origin: Point::new(origin_x_for_centered_text(&max_label, w, font), baseline),
            }
        }
        (
            ValidatedLinearGaugeOrientation::Horizontal,
            ValidatedLinearGaugeLabelPosition::Bottom,
        ) => {
            let baseline = h + gap - metrics.ascent;
            LinearGaugeLabelLayout {
                min_label: min_label.clone(),
                max_label: max_label.clone(),
                min_origin: Point::new(origin_x_for_centered_text(&min_label, 0.0, font), baseline),
                max_origin: Point::new(origin_x_for_centered_text(&max_label, w, font), baseline),
            }
        }
        (ValidatedLinearGaugeOrientation::Vertical, ValidatedLinearGaugeLabelPosition::Left) => {
            LinearGaugeLabelLayout {
                min_label: min_label.clone(),
                max_label: max_label.clone(),
                min_origin: Point::new(
                    -gap - min_bounds.right,
                    h - (min_bounds.top + min_bounds.bottom) * 0.5,
                ),
                max_origin: Point::new(
                    -gap - max_bounds.right,
                    -(max_bounds.top + max_bounds.bottom) * 0.5,
                ),
            }
        }
        (ValidatedLinearGaugeOrientation::Vertical, ValidatedLinearGaugeLabelPosition::Right) => {
            LinearGaugeLabelLayout {
                min_label: min_label.clone(),
                max_label: max_label.clone(),
                min_origin: Point::new(
                    w + gap - min_bounds.left,
                    h - (min_bounds.top + min_bounds.bottom) * 0.5,
                ),
                max_origin: Point::new(
                    w + gap - max_bounds.left,
                    -(max_bounds.top + max_bounds.bottom) * 0.5,
                ),
            }
        }
        _ => unreachable!("linear gauge label position should match validated orientation"),
    }
}

/// Backwards-compatible public entry point for shared gauge label formatting.
pub fn format_linear_gauge_label(value: f64) -> String {
    format_gauge_label(value)
}

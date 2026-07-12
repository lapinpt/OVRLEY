//! Arc gauge metric widget rendering.
//!
//! An arc gauge uses a cached static layer for its empty filled track, border,
//! labels, and unit. Each frame only draws a partial filled arc and the
//! formatted numeric value in the centre of that arc.

mod inner_widget;
mod path;

use self::inner_widget::{
    draw_static_unit, inner_widget_layout, unit_font_size, DEFAULT_GAP_PX, LINE_HEIGHT,
};
use self::path::{draw_arc_track, draw_revealed_arc_track, ArcTrackSpec};
use super::labels::format_gauge_label;
use super::range::{fill_percentage, metric_range, metric_values};
use crate::activity::schema::DenseActivityReport;
use crate::debug::RenderProfiler;
use crate::error::CoreResult;
use crate::normalize::{ValidatedArcGaugeWidget, ValidatedSceneConfig};
use crate::render::format::format_validated_metric_parts;
use crate::render::surface::create_surface;
use crate::render::text::{
    draw_text, draw_text_with_vertical_metrics_text, origin_x_for_centered_text, parse_color,
    resolve_font, validated_value_style, ResolvedTextStyle,
};
use crate::render::widgets::common::{normalize_shadow_style_validated, static_layer_padding};
use crate::render::widgets::types::{
    ArcGaugeCache, ArcGaugeFrameState, WidgetFrameReport, WidgetGeometryReport, WidgetRenderReport,
};
use crate::render::widgets::value::metric_vertical_metrics_text;
use crate::types::DisplayType;
use skia_safe::{image_filters, paint::Style, BlendMode, Canvas, Paint, Point};
use std::path::PathBuf;

pub use self::path::{
    arc_gauge_geometry, arc_point, arc_radius, arc_start_end_angles, corner_gauge_geometry,
    corner_start_end_angles, ArcGaugeGeometry,
};

const ARC_LABEL_GAP_PX: f32 = 8.0;

/// Prepares a cached static layer and per-frame states for an arc gauge.
pub fn prepare_arc_gauge_cache(
    gauge: &ValidatedArcGaugeWidget,
    dense_activity: &DenseActivityReport,
    scene: &ValidatedSceneConfig,
    scale: f32,
    font_dirs: &[PathBuf],
    prepare_profiler: &mut RenderProfiler,
) -> CoreResult<ArcGaugeCache> {
    prepare_profiler.measure("gauge.arc.prepare", || {
        let scaled_width = ((gauge.width as f32) * scale).round().max(1.0) as u32;
        let scaled_height = ((gauge.height as f32) * scale).round().max(1.0) as u32;
        let track_thickness = gauge.track_thickness * scale;
        let track_border_thickness = gauge.track_border_thickness * scale;
        let geometry = match gauge.corner_orientation {
            Some(orientation) => corner_gauge_geometry(
                scaled_width as f32,
                scaled_height as f32,
                orientation,
                track_thickness,
                gauge.track_corner_radius * scale,
                track_border_thickness,
            ),
            None => arc_gauge_geometry(
                scaled_width as f32,
                scaled_height as f32,
                gauge.arc_angle,
                track_thickness,
                track_border_thickness,
            ),
        };
        let (min_value, max_value) = metric_range(&dense_activity.series, gauge.metric);
        let text_style = validated_value_style(&gauge.inner_value, scene, scale);
        let unit_parts = format_validated_metric_parts(&gauge.inner_value, dense_activity, 0)
            .expect("validated arc gauge metric must have a formatter");
        let unit_text = unit_parts.unit_text;
        let static_unit_font_size = unit_font_size(&text_style, scale);
        let frame_states = metric_values(&dense_activity.series, gauge.metric)
            .iter()
            .enumerate()
            .map(|(frame_index, raw_value)| {
                let value = raw_value.unwrap_or(min_value);
                let parts =
                    format_validated_metric_parts(&gauge.inner_value, dense_activity, frame_index)
                        .expect("validated arc gauge metric must have a formatter");
                ArcGaugeFrameState {
                    fill01: fill_percentage(value, min_value, max_value),
                    value_text: parts.value_text,
                }
            })
            .collect::<Vec<_>>();

        let shadow = if gauge.track_border_thickness > 0.0 {
            normalize_shadow_style_validated(
                &scene.shadow_color,
                scene.shadow_strength,
                scene.shadow_distance,
                scale,
            )
        } else {
            None
        };
        let padding = arc_static_layer_padding(
            gauge,
            &text_style,
            unit_text.as_deref(),
            shadow.as_ref(),
            scale,
        );
        let layer_width = scaled_width
            .saturating_add(padding.saturating_mul(2))
            .max(1);
        let layer_height = scaled_height
            .saturating_add(padding.saturating_mul(2))
            .max(1);

        let mut surface = create_surface(layer_width, layer_height)?;
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::TRANSPARENT);
        canvas.translate((padding as f32, padding as f32));
        draw_static_arc_layer(
            canvas,
            gauge,
            scene,
            geometry,
            scale,
            font_dirs,
            min_value,
            max_value,
            unit_text.as_deref(),
            &text_style,
        )?;

        Ok(ArcGaugeCache {
            static_image: surface.image_snapshot(),
            static_image_x: gauge.x - padding as f32,
            static_image_y: gauge.y - padding as f32,
            x: gauge.x,
            y: gauge.y,
            width: scaled_width,
            height: scaled_height,
            rotation: gauge.rotation,
            display_type: gauge.display_type,
            center_x: geometry.center_x,
            center_y: geometry.center_y,
            inner_widget_center_x: geometry.inner_widget_center_x,
            inner_widget_center_y: geometry.inner_widget_center_y,
            start_angle: geometry.start_angle,
            sweep_angle: geometry.sweep_angle,
            radius: geometry.radius,
            track_thickness,
            track_corner_radius: gauge.track_corner_radius * scale,
            track_filled_color: gauge.track_filled_color.clone(),
            track_filled_opacity: gauge.track_filled_opacity,
            track_fill_flat: gauge.track_fill_flat,
            text_style,
            has_unit: unit_text.is_some(),
            unit_font_size: static_unit_font_size,
            inner_widget_gap: DEFAULT_GAP_PX * scale,
            inner_widget_offset_x: gauge.inner_widget_offset_x * scale,
            inner_widget_offset_y: gauge.inner_widget_offset_y * scale,
            font_dirs: font_dirs.to_vec(),
            min_value,
            max_value,
            frame_states,
        })
    })
}

/// Draws one frame of an arc gauge: cached static content first, then the
/// dynamic filled arc and formatted numeric value.
pub fn draw_arc_gauge_widget(
    canvas: &Canvas,
    cache: &ArcGaugeCache,
    frame_index: usize,
    frame_profiler: &mut RenderProfiler,
) -> Option<WidgetRenderReport> {
    if !matches!(cache.display_type, DisplayType::Arc | DisplayType::Corner) {
        return None;
    }

    frame_profiler.measure("gauge.arc.draw", || {
        canvas.draw_image(
            &cache.static_image,
            (cache.static_image_x, cache.static_image_y),
            None,
        );

        let state = cache
            .frame_states
            .get(frame_index)
            .or_else(|| cache.frame_states.last())?;
        let geometry = ArcGaugeGeometry {
            center_x: cache.x + cache.center_x,
            center_y: cache.y + cache.center_y,
            inner_widget_center_x: cache.x + cache.inner_widget_center_x,
            inner_widget_center_y: cache.y + cache.inner_widget_center_y,
            radius: cache.radius,
            start_angle: cache.start_angle,
            sweep_angle: cache.sweep_angle,
        };
        if state.fill01 > 0.0 && geometry.radius > 0.0 {
            let fill_end_corner_radius = if cache.track_fill_flat {
                0.0
            } else {
                cache.track_corner_radius
            };
            let track =
                ArcTrackSpec::full(geometry, cache.track_thickness, cache.track_corner_radius)
                    .with_end_corner_radius(fill_end_corner_radius);
            let paint = track_paint(
                parse_color(
                    &cache.track_filled_color,
                    cache.track_filled_opacity * cache.text_style.opacity,
                ),
                None,
            );
            draw_revealed_arc_track(canvas, track, state.fill01, &paint);
        }

        let inner_layout = inner_widget_layout(
            geometry,
            cache.inner_widget_offset_x,
            cache.inner_widget_offset_y,
            &cache.text_style,
            cache.has_unit.then_some(cache.unit_font_size),
            cache.inner_widget_gap,
        );
        let font = resolve_font(
            &cache.font_dirs,
            cache.text_style.font_name.as_deref(),
            cache.text_style.font_size,
        )
        .ok()?;
        let mut value_style = cache.text_style.clone();
        // The live value must stay anchored by its advance. Ink bounds vary
        // between digits even when their advances are identical, which would
        // otherwise make a monospaced numeric readout jump horizontally.
        let (value_advance, _) = font.measure_str(&state.value_text, None);
        value_style.x = inner_layout.center_x - value_advance * 0.5;
        value_style.y = inner_layout.value_top;
        value_style.line_height = cache.text_style.font_size * LINE_HEIGHT;
        draw_text_with_vertical_metrics_text(
            canvas,
            &state.value_text,
            metric_vertical_metrics_text(&state.value_text),
            &value_style,
            &cache.font_dirs,
        )
        .ok()?;

        let marker = arc_point(
            geometry.center_x,
            geometry.center_y,
            geometry.radius,
            geometry.start_angle + geometry.sweep_angle * state.fill01,
        );
        Some(WidgetRenderReport {
            geometry: WidgetGeometryReport {
                point_count: 0,
                source_point_count: 0,
                simplification: "arc_gauge".to_string(),
                bbox: [cache.x, cache.y, cache.width as f32, cache.height as f32],
                widget_width: cache.width,
                widget_height: cache.height,
                rotation_deg: cache.rotation,
            },
            frame: WidgetFrameReport {
                progress01: state.fill01,
                marker_x: marker.x - cache.x,
                marker_y: marker.y - cache.y,
                marker_abs_x: marker.x,
                marker_abs_y: marker.y,
            },
        })
    })
}

fn draw_static_arc_layer(
    canvas: &Canvas,
    gauge: &ValidatedArcGaugeWidget,
    scene: &ValidatedSceneConfig,
    geometry: ArcGaugeGeometry,
    scale: f32,
    font_dirs: &[PathBuf],
    min_value: f64,
    max_value: f64,
    unit_text: Option<&str>,
    text_style: &ResolvedTextStyle,
) -> CoreResult<()> {
    let track_thickness = gauge.track_thickness * scale;
    let border_thickness = gauge.track_border_thickness * scale;
    let inner_track =
        ArcTrackSpec::full(geometry, track_thickness, gauge.track_corner_radius * scale);
    let border_track = inner_track.outset(border_thickness);
    let shadow = if border_thickness > 0.0 {
        normalize_shadow_style_validated(
            &scene.shadow_color,
            scene.shadow_strength,
            scene.shadow_distance,
            scale,
        )
    } else {
        None
    };

    if let Some(shadow) = shadow.and_then(|shadow| {
        image_filters::drop_shadow_only(
            (shadow.offset_x, shadow.offset_y),
            (shadow.strength, shadow.strength),
            parse_color(&shadow.color, text_style.opacity),
            None,
            None,
            None,
        )
    }) {
        let paint = track_paint(
            parse_color(&gauge.track_border_color, text_style.opacity),
            Some(shadow),
        );
        draw_arc_track(canvas, border_track, &paint);
    }

    if border_thickness > 0.0 {
        let paint = track_paint(
            parse_color(&gauge.track_border_color, text_style.opacity),
            None,
        );
        draw_arc_track(canvas, border_track, &paint);
        // Match the linear gauge's ring construction. The empty track can
        // be translucent, so it must be drawn over a transparent interior
        // rather than over the border colour.
        let clear_paint = clear_track_paint();
        draw_arc_track(canvas, inner_track, &clear_paint);
    }

    let empty_paint = track_paint(
        parse_color(
            &gauge.track_empty_color,
            gauge.track_empty_opacity * text_style.opacity,
        ),
        None,
    );
    draw_arc_track(canvas, inner_track, &empty_paint);

    if gauge.show_min_max_labels {
        draw_arc_labels(
            canvas, gauge, geometry, scale, font_dirs, min_value, max_value, text_style,
        )?;
    }

    if let Some(unit_text) = unit_text {
        draw_static_unit(
            canvas, gauge, geometry, scale, font_dirs, unit_text, text_style,
        )?;
    }

    Ok(())
}

fn draw_arc_labels(
    canvas: &Canvas,
    gauge: &ValidatedArcGaugeWidget,
    geometry: ArcGaugeGeometry,
    scale: f32,
    font_dirs: &[PathBuf],
    min_value: f64,
    max_value: f64,
    text_style: &ResolvedTextStyle,
) -> CoreResult<()> {
    let font_size = gauge.min_max_label_font_size * scale;
    let font = resolve_font(font_dirs, Some(&gauge.min_max_label_font), font_size)?;
    let mut label_style = text_style.clone();
    label_style.font_name = Some(gauge.min_max_label_font.clone());
    label_style.font_size = font_size;
    label_style.line_height = font_size * LINE_HEIGHT;
    label_style.color = parse_color(&gauge.min_max_label_color, text_style.opacity);
    let min_label = format_gauge_label(min_value);
    let max_label = format_gauge_label(max_value);
    let (min_angle, max_angle) = arc_label_angles(geometry);

    for (label, angle) in [(&min_label, min_angle), (&max_label, max_angle)] {
        let anchor = arc_label_anchor(
            geometry,
            angle,
            gauge.track_thickness * scale,
            gauge.track_border_thickness * scale,
            font_size,
            scale,
        );
        let mut style = label_style.clone();
        style.x = origin_x_for_centered_text(label, anchor.x, &font);
        style.y = anchor.y - style.line_height * 0.5;
        draw_text(canvas, label, &style, font_dirs)?;
    }
    Ok(())
}

fn arc_static_layer_padding(
    gauge: &ValidatedArcGaugeWidget,
    text_style: &ResolvedTextStyle,
    unit_text: Option<&str>,
    shadow: Option<&crate::render::widgets::types::ShadowStyle>,
    scale: f32,
) -> u32 {
    let track_padding = static_layer_padding(
        (gauge.track_thickness + gauge.track_border_thickness * 2.0) * scale,
        shadow,
    );
    let labels_padding = if gauge.show_min_max_labels {
        ((gauge.min_max_label_font_size * scale) * 4.0
            + arc_label_gap(gauge.min_max_label_font_size * scale, scale))
        .ceil() as u32
    } else {
        0
    };
    // The static layer owns only the unit, but reserve enough room for its
    // configured offset and for scene text effects. Dynamic value text is
    // drawn directly on the frame canvas and is intentionally unconstrained.
    let unit_padding = unit_text
        .map(|_| {
            (text_style.font_size * 2.0
                + (gauge.inner_widget_offset_x * scale).abs()
                + (gauge.inner_widget_offset_y * scale).abs())
            .ceil() as u32
        })
        .unwrap_or(0);
    track_padding.max(labels_padding).max(unit_padding)
}

fn track_paint(color: skia_safe::Color, image_filter: Option<skia_safe::ImageFilter>) -> Paint {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(Style::Fill);
    paint.set_color(color);
    if let Some(image_filter) = image_filter {
        paint.set_image_filter(image_filter);
    }
    paint
}

fn clear_track_paint() -> Paint {
    let mut clear_paint = Paint::default();
    clear_paint.set_anti_alias(true);
    clear_paint.set_style(Style::Fill);
    clear_paint.set_blend_mode(BlendMode::Clear);
    clear_paint
}

fn arc_label_angles(geometry: ArcGaugeGeometry) -> (f32, f32) {
    if geometry.sweep_angle.abs() >= crate::normalize::MAX_ARC_ANGLE_DEGREES - f32::EPSILON {
        // A full circle has coincident start/end points. Keep labels readable
        // by anchoring the range at the visual left and right edges instead.
        (180.0, 0.0)
    } else {
        (
            geometry.start_angle,
            geometry.start_angle + geometry.sweep_angle,
        )
    }
}

fn arc_label_anchor(
    geometry: ArcGaugeGeometry,
    angle: f32,
    track_thickness: f32,
    border_thickness: f32,
    label_font_size: f32,
    scale: f32,
) -> Point {
    let radial_distance = geometry.radius
        + track_thickness * 0.5
        + border_thickness
        + arc_label_gap(label_font_size, scale);
    arc_point(geometry.center_x, geometry.center_y, radial_distance, angle)
}

fn arc_label_gap(font_size: f32, scale: f32) -> f32 {
    (font_size * 0.35).max(ARC_LABEL_GAP_PX * scale)
}

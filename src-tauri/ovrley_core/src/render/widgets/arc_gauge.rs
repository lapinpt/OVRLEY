//! Arc gauge metric widget rendering.
//!
//! An arc gauge uses a cached static layer for its empty filled track, border,
//! labels, and unit. Each frame only draws a partial filled arc and the
//! formatted numeric value in the centre of that arc.

use crate::activity::schema::DenseActivityReport;
use crate::debug::RenderProfiler;
use crate::error::CoreResult;
use crate::normalize::{
    ValidatedArcGaugeWidget, ValidatedSceneConfig, MAX_ARC_ANGLE_DEGREES, MIN_ARC_ANGLE_DEGREES,
};
use crate::render::format::format_validated_metric_parts;
use crate::render::surface::create_surface;
use crate::render::text::{
    draw_text, draw_text_with_vertical_metrics_text, origin_x_for_centered_text, parse_color,
    resolve_font, validated_value_style, ResolvedTextStyle,
};
use crate::render::widgets::common::{normalize_shadow_style_validated, static_layer_padding};
use crate::render::widgets::linear_gauge::{
    fill_percentage, format_linear_gauge_label, metric_range, metric_values,
};
use crate::render::widgets::types::{
    ArcGaugeCache, ArcGaugeFrameState, WidgetFrameReport, WidgetGeometryReport, WidgetRenderReport,
};
use crate::render::widgets::value::metric_vertical_metrics_text;
use crate::types::DisplayType;
use skia_safe::{
    image_filters, paint::Style, BlendMode, Canvas, Paint, PathBuilder, PathFillType, Point,
};
use std::path::PathBuf;

const ARC_LABEL_GAP_PX: f32 = 8.0;
const INNER_WIDGET_LINE_HEIGHT: f32 = 0.92;
const INNER_WIDGET_UNIT_RATIO: f32 = 0.28;
const INNER_WIDGET_MIN_UNIT_FONT_SIZE: f32 = 12.0;
const INNER_WIDGET_GAP_PX: f32 = 4.0;
const ARC_PATH_EPSILON: f32 = 0.001;
const ARC_QUARTER_CIRCLE_KAPPA: f32 = 0.552_284_76;

/// Arc geometry shared by static and dynamic drawing. Angles use Skia's
/// screen-space convention: 0° is right, 90° is down, and increasing angles
/// advance clockwise. This makes a 180° arc run left -> top -> right.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ArcGaugeGeometry {
    pub center_x: f32,
    pub center_y: f32,
    pub radius: f32,
    pub start_angle: f32,
    pub sweep_angle: f32,
}

#[derive(Clone, Copy, Debug)]
struct ArcInnerWidgetLayout {
    center_x: f32,
    value_top: f32,
    unit_top: Option<f32>,
}

/// Returns the start and end angles for a vertically symmetric arc.
///
/// A 180° arc starts at 180° (left) and ends at 360° (right), travelling over
/// the top of the circle. Runtime clamping is a safety guard; validation
/// rejects out-of-range persisted configs before this function is used.
pub fn arc_start_end_angles(arc_angle: f32) -> (f32, f32) {
    let angle = arc_angle.clamp(MIN_ARC_ANGLE_DEGREES, MAX_ARC_ANGLE_DEGREES);
    (270.0 - angle * 0.5, 270.0 + angle * 0.5)
}

/// Calculates an arc radius that keeps the filled track and its border inside
/// the widget's smaller dimension.
pub fn arc_radius(width: f32, height: f32, track_thickness: f32, border_thickness: f32) -> f32 {
    let outer_half_thickness = track_thickness.max(0.0) * 0.5 + border_thickness.max(0.0);
    (width.min(height) * 0.5 - outer_half_thickness).max(0.0)
}

/// Returns a point on the arc for a Skia screen-space angle.
pub fn arc_point(center_x: f32, center_y: f32, radius: f32, angle: f32) -> Point {
    let radians = angle.to_radians();
    Point::new(
        center_x + radius * radians.cos(),
        center_y + radius * radians.sin(),
    )
}

/// Builds all geometry needed to draw an arc in widget-local coordinates.
pub fn arc_gauge_geometry(
    width: f32,
    height: f32,
    arc_angle: f32,
    track_thickness: f32,
    border_thickness: f32,
) -> ArcGaugeGeometry {
    let (start_angle, end_angle) = arc_start_end_angles(arc_angle);
    ArcGaugeGeometry {
        center_x: width * 0.5,
        center_y: height * 0.5,
        radius: arc_radius(width, height, track_thickness, border_thickness),
        start_angle,
        sweep_angle: end_angle - start_angle,
    }
}

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
        let geometry = arc_gauge_geometry(
            scaled_width as f32,
            scaled_height as f32,
            gauge.arc_angle,
            track_thickness,
            track_border_thickness,
        );
        let (min_value, max_value) = metric_range(&dense_activity.series, gauge.metric);
        let text_style = validated_value_style(&gauge.inner_value, scene, scale);
        let unit_parts = format_validated_metric_parts(&gauge.inner_value, dense_activity, 0)
            .expect("validated arc gauge metric must have a formatter");
        let unit_text = unit_parts.unit_text;
        let unit_font_size = (text_style.font_size * INNER_WIDGET_UNIT_RATIO)
            .max(INNER_WIDGET_MIN_UNIT_FONT_SIZE * scale);
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
            display_type: DisplayType::Arc,
            arc_angle: gauge.arc_angle,
            radius: geometry.radius,
            track_thickness,
            track_corner_radius: gauge.track_corner_radius * scale,
            track_filled_color: gauge.track_filled_color.clone(),
            track_filled_opacity: gauge.track_filled_opacity,
            text_style,
            has_unit: unit_text.is_some(),
            unit_font_size,
            inner_widget_gap: INNER_WIDGET_GAP_PX * scale,
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
    if cache.display_type != DisplayType::Arc {
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
            center_x: cache.x + cache.width as f32 * 0.5,
            center_y: cache.y + cache.height as f32 * 0.5,
            radius: cache.radius,
            start_angle: arc_start_end_angles(cache.arc_angle).0,
            sweep_angle: cache
                .arc_angle
                .clamp(MIN_ARC_ANGLE_DEGREES, MAX_ARC_ANGLE_DEGREES),
        };
        if state.fill01 > 0.0 && geometry.radius > 0.0 {
            draw_arc_track(
                canvas,
                geometry,
                geometry.sweep_angle * state.fill01,
                cache.track_thickness,
                parse_color(
                    &cache.track_filled_color,
                    cache.track_filled_opacity * cache.text_style.opacity,
                ),
                cache.track_corner_radius,
                None,
            );
        }

        let inner_layout = arc_inner_widget_layout(
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
        value_style.x = origin_x_for_centered_text(&state.value_text, inner_layout.center_x, &font);
        value_style.y = inner_layout.value_top;
        value_style.line_height = cache.text_style.font_size * INNER_WIDGET_LINE_HEIGHT;
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
    let outer_track_thickness = track_thickness + border_thickness * 2.0;
    let inner_corner_radius = gauge.track_corner_radius * scale;
    let outer_corner_radius = inner_corner_radius + border_thickness;
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
        draw_arc_track(
            canvas,
            geometry,
            geometry.sweep_angle,
            outer_track_thickness,
            parse_color(&gauge.track_border_color, text_style.opacity),
            outer_corner_radius,
            Some(shadow),
        );
    }

    if border_thickness > 0.0 {
        draw_arc_track(
            canvas,
            geometry,
            geometry.sweep_angle,
            outer_track_thickness,
            parse_color(&gauge.track_border_color, text_style.opacity),
            outer_corner_radius,
            None,
        );
        // Match the linear gauge's ring construction. The empty track can
        // be translucent, so it must be drawn over a transparent interior
        // rather than over the border colour.
        clear_arc_track(
            canvas,
            geometry,
            geometry.sweep_angle,
            track_thickness,
            inner_corner_radius,
        );
    }

    draw_arc_track(
        canvas,
        geometry,
        geometry.sweep_angle,
        track_thickness,
        parse_color(
            &gauge.track_empty_color,
            gauge.track_empty_opacity * text_style.opacity,
        ),
        inner_corner_radius,
        None,
    );

    if gauge.show_min_max_labels {
        draw_arc_labels(
            canvas, gauge, geometry, scale, font_dirs, min_value, max_value, text_style,
        )?;
    }

    if let Some(unit_text) = unit_text {
        draw_static_inner_unit(
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
    label_style.line_height = font_size * INNER_WIDGET_LINE_HEIGHT;
    label_style.color = parse_color(&gauge.min_max_label_color, text_style.opacity);
    let min_label = format_linear_gauge_label(min_value);
    let max_label = format_linear_gauge_label(max_value);
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

fn draw_static_inner_unit(
    canvas: &Canvas,
    gauge: &ValidatedArcGaugeWidget,
    geometry: ArcGaugeGeometry,
    scale: f32,
    font_dirs: &[PathBuf],
    unit_text: &str,
    text_style: &ResolvedTextStyle,
) -> CoreResult<()> {
    let unit_style = arc_unit_text_style(text_style, gauge, scale);
    let layout = arc_inner_widget_layout(
        geometry,
        gauge.inner_widget_offset_x * scale,
        gauge.inner_widget_offset_y * scale,
        text_style,
        Some(unit_style.font_size),
        INNER_WIDGET_GAP_PX * scale,
    );
    let font = resolve_font(
        font_dirs,
        unit_style.font_name.as_deref(),
        unit_style.font_size,
    )?;
    let mut positioned_style = unit_style;
    positioned_style.x = origin_x_for_centered_text(unit_text, layout.center_x, &font);
    positioned_style.y = layout
        .unit_top
        .expect("unit layout must include a top when a unit exists");
    draw_text(canvas, unit_text, &positioned_style, font_dirs)
}

fn arc_unit_text_style(
    text_style: &ResolvedTextStyle,
    gauge: &ValidatedArcGaugeWidget,
    scale: f32,
) -> ResolvedTextStyle {
    let mut unit_style = text_style.clone();
    unit_style.font_size = (text_style.font_size * INNER_WIDGET_UNIT_RATIO)
        .max(INNER_WIDGET_MIN_UNIT_FONT_SIZE * scale);
    unit_style.line_height = unit_style.font_size * INNER_WIDGET_LINE_HEIGHT;
    unit_style.color = skia_safe::Color::from_argb(
        gauge.inner_value.unit_color[3],
        gauge.inner_value.unit_color[0],
        gauge.inner_value.unit_color[1],
        gauge.inner_value.unit_color[2],
    );
    unit_style
}

fn arc_inner_widget_layout(
    geometry: ArcGaugeGeometry,
    offset_x: f32,
    offset_y: f32,
    text_style: &ResolvedTextStyle,
    unit_font_size: Option<f32>,
    minimum_gap: f32,
) -> ArcInnerWidgetLayout {
    let value_line_height = text_style.font_size * INNER_WIDGET_LINE_HEIGHT;
    let unit_line_height = unit_font_size.unwrap_or(0.0) * INNER_WIDGET_LINE_HEIGHT;
    let gap = (text_style.font_size * 0.08).max(minimum_gap);
    let group_height = if unit_font_size.is_some() {
        value_line_height + gap + unit_line_height
    } else {
        value_line_height
    };
    let top = geometry.center_y + offset_y - group_height * 0.5;

    ArcInnerWidgetLayout {
        center_x: geometry.center_x + offset_x,
        value_top: top,
        unit_top: unit_font_size.map(|_| top + value_line_height + gap),
    }
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

/// Draws one closed filled arc-track outline. This deliberately avoids Skia's
/// binary stroke-cap modes so `track_corner_radius` remains continuous.
fn draw_arc_track(
    canvas: &Canvas,
    geometry: ArcGaugeGeometry,
    sweep_angle: f32,
    stroke_width: f32,
    color: skia_safe::Color,
    corner_radius: f32,
    image_filter: Option<skia_safe::ImageFilter>,
) {
    let Some(path) = arc_filled_track_path(geometry, sweep_angle, stroke_width, corner_radius)
    else {
        return;
    };
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(Style::Fill);
    paint.set_color(color);
    if let Some(image_filter) = image_filter {
        paint.set_image_filter(image_filter);
    }
    canvas.draw_path(&path, &paint);
}

/// Erases the inside of a bordered arc before a translucent empty track is
/// drawn. This produces a real border ring rather than compositing the empty
/// colour over the border colour.
fn clear_arc_track(
    canvas: &Canvas,
    geometry: ArcGaugeGeometry,
    sweep_angle: f32,
    stroke_width: f32,
    corner_radius: f32,
) {
    let Some(path) = arc_filled_track_path(geometry, sweep_angle, stroke_width, corner_radius)
    else {
        return;
    };
    let mut clear_paint = Paint::default();
    clear_paint.set_anti_alias(true);
    clear_paint.set_style(Style::Fill);
    clear_paint.set_blend_mode(BlendMode::Clear);
    canvas.draw_path(&path, &clear_paint);
}

/// Builds the same outline as `getArcFilledTrackPath` in the SVG preview.
/// The outer and inner circular edges are cubic Beziers, joined at each end
/// by true corner fillets. With a radius of half the track width, the two
/// fillets meet as a semicircle; at zero they collapse to a flat radial edge.
fn arc_filled_track_path(
    geometry: ArcGaugeGeometry,
    sweep_angle: f32,
    track_thickness: f32,
    corner_radius: f32,
) -> Option<skia_safe::Path> {
    let sweep = sweep_angle.clamp(0.0, MAX_ARC_ANGLE_DEGREES);
    let half_thickness = track_thickness.max(0.0) * 0.5;
    let outer_radius = geometry.radius + half_thickness;
    let inner_radius = geometry.radius - half_thickness;
    if sweep <= ARC_PATH_EPSILON
        || half_thickness <= ARC_PATH_EPSILON
        || inner_radius <= ARC_PATH_EPSILON
    {
        return None;
    }

    let start = geometry.start_angle;
    let mut path = PathBuilder::new_with_fill_type(PathFillType::EvenOdd);
    path.move_to(arc_point(
        geometry.center_x,
        geometry.center_y,
        outer_radius,
        start,
    ));

    if sweep >= MAX_ARC_ANGLE_DEGREES - ARC_PATH_EPSILON {
        append_circular_arc(
            &mut path,
            geometry.center_x,
            geometry.center_y,
            outer_radius,
            start,
            MAX_ARC_ANGLE_DEGREES,
        );
        path.close();
        path.move_to(arc_point(
            geometry.center_x,
            geometry.center_y,
            inner_radius,
            start,
        ));
        append_circular_arc(
            &mut path,
            geometry.center_x,
            geometry.center_y,
            inner_radius,
            start,
            -MAX_ARC_ANGLE_DEGREES,
        );
        path.close();
        return Some(path.detach());
    }

    let end = start + sweep;
    let fillet_radius = corner_radius.clamp(0.0, half_thickness);
    append_circular_arc(
        &mut path,
        geometry.center_x,
        geometry.center_y,
        outer_radius,
        start,
        sweep,
    );
    append_outer_to_inner_fillet(
        &mut path,
        arc_point(geometry.center_x, geometry.center_y, geometry.radius, end),
        arc_path_tangent(end),
        arc_path_normal(end),
        half_thickness,
        fillet_radius,
    );
    append_circular_arc(
        &mut path,
        geometry.center_x,
        geometry.center_y,
        inner_radius,
        end,
        -sweep,
    );
    let start_tangent = arc_path_tangent(start);
    append_inner_to_outer_fillet(
        &mut path,
        arc_point(geometry.center_x, geometry.center_y, geometry.radius, start),
        Point::new(-start_tangent.x, -start_tangent.y),
        arc_path_normal(start),
        half_thickness,
        fillet_radius,
    );
    path.close();
    Some(path.detach())
}

fn append_circular_arc(
    path: &mut PathBuilder,
    center_x: f32,
    center_y: f32,
    radius: f32,
    start_angle: f32,
    sweep_angle: f32,
) {
    let segment_count = ((sweep_angle.abs() / 90.0).ceil() as u32).max(1);
    let segment_sweep = sweep_angle / segment_count as f32;

    for index in 0..segment_count {
        let angle0 = start_angle + segment_sweep * index as f32;
        let angle1 = angle0 + segment_sweep;
        let control_distance = radius * (4.0 / 3.0) * ((angle1 - angle0).to_radians() * 0.25).tan();
        let start = arc_point(center_x, center_y, radius, angle0);
        let end = arc_point(center_x, center_y, radius, angle1);
        let start_tangent = arc_path_tangent(angle0);
        let end_tangent = arc_path_tangent(angle1);
        path.cubic_to(
            Point::new(
                start.x + start_tangent.x * control_distance,
                start.y + start_tangent.y * control_distance,
            ),
            Point::new(
                end.x - end_tangent.x * control_distance,
                end.y - end_tangent.y * control_distance,
            ),
            end,
        );
    }
}

fn append_outer_to_inner_fillet(
    path: &mut PathBuilder,
    origin: Point,
    tangent: Point,
    normal: Point,
    half_thickness: f32,
    corner_radius: f32,
) {
    if corner_radius <= ARC_PATH_EPSILON {
        path.line_to(local_arc_path_point(
            origin,
            tangent,
            normal,
            0.0,
            -half_thickness,
        ));
        return;
    }

    let kappa = corner_radius * ARC_QUARTER_CIRCLE_KAPPA;
    let upper_end = local_arc_path_point(
        origin,
        tangent,
        normal,
        corner_radius,
        half_thickness - corner_radius,
    );
    let lower_start = local_arc_path_point(
        origin,
        tangent,
        normal,
        corner_radius,
        -half_thickness + corner_radius,
    );
    path.cubic_to(
        local_arc_path_point(origin, tangent, normal, kappa, half_thickness),
        local_arc_path_point(
            origin,
            tangent,
            normal,
            corner_radius,
            half_thickness - corner_radius + kappa,
        ),
        upper_end,
    );
    path.line_to(lower_start);
    path.cubic_to(
        local_arc_path_point(
            origin,
            tangent,
            normal,
            corner_radius,
            -half_thickness + corner_radius - kappa,
        ),
        local_arc_path_point(origin, tangent, normal, kappa, -half_thickness),
        local_arc_path_point(origin, tangent, normal, 0.0, -half_thickness),
    );
}

fn append_inner_to_outer_fillet(
    path: &mut PathBuilder,
    origin: Point,
    tangent: Point,
    normal: Point,
    half_thickness: f32,
    corner_radius: f32,
) {
    if corner_radius <= ARC_PATH_EPSILON {
        path.line_to(local_arc_path_point(
            origin,
            tangent,
            normal,
            0.0,
            half_thickness,
        ));
        return;
    }

    let kappa = corner_radius * ARC_QUARTER_CIRCLE_KAPPA;
    let lower_end = local_arc_path_point(
        origin,
        tangent,
        normal,
        corner_radius,
        -half_thickness + corner_radius,
    );
    let upper_start = local_arc_path_point(
        origin,
        tangent,
        normal,
        corner_radius,
        half_thickness - corner_radius,
    );
    path.cubic_to(
        local_arc_path_point(origin, tangent, normal, kappa, -half_thickness),
        local_arc_path_point(
            origin,
            tangent,
            normal,
            corner_radius,
            -half_thickness + corner_radius - kappa,
        ),
        lower_end,
    );
    path.line_to(upper_start);
    path.cubic_to(
        local_arc_path_point(
            origin,
            tangent,
            normal,
            corner_radius,
            half_thickness - corner_radius + kappa,
        ),
        local_arc_path_point(origin, tangent, normal, kappa, half_thickness),
        local_arc_path_point(origin, tangent, normal, 0.0, half_thickness),
    );
}

fn arc_path_tangent(angle: f32) -> Point {
    let radians = angle.to_radians();
    Point::new(-radians.sin(), radians.cos())
}

fn arc_path_normal(angle: f32) -> Point {
    let radians = angle.to_radians();
    Point::new(radians.cos(), radians.sin())
}

fn local_arc_path_point(origin: Point, tangent: Point, normal: Point, x: f32, y: f32) -> Point {
    Point::new(
        origin.x + tangent.x * x + normal.x * y,
        origin.y + tangent.y * x + normal.y * y,
    )
}

fn arc_label_angles(geometry: ArcGaugeGeometry) -> (f32, f32) {
    if geometry.sweep_angle >= MAX_ARC_ANGLE_DEGREES - f32::EPSILON {
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

//! Static track layers and dynamic fill rendering for arc gauges.
//!
//! Static rendering caches empty tracks, borders, shadows, labels, and units.
//! Dynamic rendering uses the same canonical track geometry for continuous
//! reveals and rounded segmented wedges, so fill cannot change the silhouette.

use super::draw_arc_labels;
use super::geometry::ArcGaugeGeometry;
use super::inner_widget::draw_static_unit;
use super::path::ArcTrackSpec;
use super::segment::{draw_segment, segment_geometries};
use crate::error::CoreResult;
use crate::normalize::{ValidatedArcGaugeWidget, ValidatedSceneConfig};
use crate::render::text::{parse_color, ResolvedTextStyle};
use crate::render::widgets::common::normalize_shadow_style_validated;
use crate::render::widgets::types::ArcGaugeCache;
use crate::types::TrackFillStyle;
use skia_safe::{image_filters, paint::Style, BlendMode, Canvas, ClipOp, Paint};
use std::path::PathBuf;

/// Builds the padded, cached image containing every frame-invariant element.
pub(super) fn draw_static_layer(
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
    let shadow_filter = shadow.and_then(|shadow| {
        image_filters::drop_shadow_only(
            (shadow.offset_x, shadow.offset_y),
            (shadow.strength, shadow.strength),
            parse_color(&shadow.color, text_style.opacity),
            None,
            None,
            None,
        )
    });

    match crate::normalize::scale_bar_geometry(gauge.bar_geometry, scale) {
        Some(bar_geometry) => {
            for segment in segment_geometries(geometry, bar_geometry) {
                draw_static_track(
                    canvas,
                    gauge,
                    segment,
                    track_thickness,
                    border_thickness,
                    scale,
                    text_style,
                    shadow_filter.as_ref(),
                );
            }
        }
        None => draw_static_track(
            canvas,
            gauge,
            geometry,
            track_thickness,
            border_thickness,
            scale,
            text_style,
            shadow_filter.as_ref(),
        ),
    }

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

fn draw_static_track(
    canvas: &Canvas,
    gauge: &ValidatedArcGaugeWidget,
    geometry: ArcGaugeGeometry,
    track_thickness: f32,
    border_thickness: f32,
    scale: f32,
    text_style: &ResolvedTextStyle,
    shadow_filter: Option<&skia_safe::ImageFilter>,
) {
    let inner_corner_radius = gauge.track_corner_radius * scale;
    let border_color = parse_color(&gauge.track_border_color, text_style.opacity);

    if let Some(shadow_filter) = shadow_filter {
        draw_segment(
            canvas,
            geometry,
            track_thickness,
            inner_corner_radius,
            &segment_border_paint(border_color, border_thickness, Some(shadow_filter.clone())),
        );
    }
    if border_thickness > 0.0 {
        draw_segment(
            canvas,
            geometry,
            track_thickness,
            inner_corner_radius,
            &segment_border_paint(border_color, border_thickness, None),
        );
        draw_segment(
            canvas,
            geometry,
            track_thickness,
            inner_corner_radius,
            &clear_track_paint(),
        );
    }
    draw_segment(
        canvas,
        geometry,
        track_thickness,
        inner_corner_radius,
        &track_paint(
            parse_color(
                &gauge.track_empty_color,
                gauge.track_empty_opacity * text_style.opacity,
            ),
            None,
        ),
    );
}

/// Dispatches the current fill to the continuous or segmented painting model.
pub(super) fn draw_fill(
    canvas: &Canvas,
    cache: &ArcGaugeCache,
    geometry: ArcGaugeGeometry,
    fill01: f32,
) {
    match cache.track_fill_style {
        TrackFillStyle::Bars => draw_segmented_fill(canvas, cache, geometry, fill01),
        TrackFillStyle::Fill => draw_continuous_fill(canvas, cache, geometry, fill01),
    }
}

fn draw_segmented_fill(
    canvas: &Canvas,
    cache: &ArcGaugeCache,
    geometry: ArcGaugeGeometry,
    fill01: f32,
) {
    let bars = cache
        .bar_geometry
        .expect("bars fill style must carry resolved bar geometry");
    let filled_count = super::super::metric::bar_fill_count(fill01, bars.count);
    let paint = fill_paint(cache);
    for segment in segment_geometries(geometry, bars)
        .into_iter()
        .take(filled_count)
    {
        draw_segment(
            canvas,
            segment,
            cache.track_thickness,
            cache.track_corner_radius,
            &paint,
        );
    }
}

fn draw_continuous_fill(
    canvas: &Canvas,
    cache: &ArcGaugeCache,
    geometry: ArcGaugeGeometry,
    fill01: f32,
) {
    let end_corner_radius = if cache.track_fill_flat {
        0.0
    } else {
        cache.track_corner_radius
    };
    let reveal_spec =
        ArcTrackSpec::full(geometry, cache.track_thickness, cache.track_corner_radius)
            .with_end_corner_radius(end_corner_radius);
    let Some(reveal) = reveal_spec.reveal_clip(fill01) else {
        return;
    };
    let Some(reveal_path) = reveal.path(&reveal_spec) else {
        return;
    };

    canvas.save();
    canvas.clip_path(&reveal_path, ClipOp::Intersect, true);
    draw_segment(
        canvas,
        geometry,
        cache.track_thickness,
        cache.track_corner_radius,
        &fill_paint(cache),
    );
    canvas.restore();
}

fn fill_paint(cache: &ArcGaugeCache) -> Paint {
    track_paint(
        parse_color(
            &cache.track_filled_color,
            cache.track_filled_opacity * cache.text_style.opacity,
        ),
        None,
    )
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

fn segment_border_paint(
    color: skia_safe::Color,
    border_thickness: f32,
    image_filter: Option<skia_safe::ImageFilter>,
) -> Paint {
    let mut paint = track_paint(color, image_filter);
    paint.set_style(Style::StrokeAndFill);
    paint.set_stroke_width(border_thickness * 2.0);
    paint
}

fn clear_track_paint() -> Paint {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(Style::Fill);
    paint.set_blend_mode(BlendMode::Clear);
    paint
}

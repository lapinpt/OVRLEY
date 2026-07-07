//! Static backdrop widget drawing.

use crate::normalize::ValidatedBackdrop;
use crate::render::text::parse_color;
use crate::types::BackdropType;
use skia_safe::{paint::Style, Canvas, Paint, Point, Rect};

pub(crate) fn draw_backdrops_static_layer(
    canvas: &Canvas,
    backdrops: &[ValidatedBackdrop],
    scale: f32,
) {
    for backdrop in backdrops {
        draw_backdrop(canvas, backdrop, scale);
    }
}

pub(crate) fn draw_backdrop(canvas: &Canvas, backdrop: &ValidatedBackdrop, scale: f32) {
    match backdrop.display_type {
        BackdropType::Circle => draw_circle_backdrop(canvas, backdrop, scale),
        BackdropType::Rectangle => draw_rectangle_backdrop(canvas, backdrop, scale),
    }
}

fn backdrop_paint(color: &str, opacity: f32, style: Style) -> Paint {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(style);
    paint.set_color(parse_color(color, opacity));
    paint
}

fn draw_circle_backdrop(canvas: &Canvas, backdrop: &ValidatedBackdrop, scale: f32) {
    let diameter = backdrop.diameter as f32 * scale;
    let center = Point::new(backdrop.x + diameter * 0.5, backdrop.y + diameter * 0.5);
    let fill_alpha = backdrop.opacity * backdrop.fill_opacity;
    let fill_paint = backdrop_paint(&backdrop.fill_color, fill_alpha, Style::Fill);

    canvas.draw_circle(center, diameter * 0.5, &fill_paint);

    if backdrop.border_thickness <= 0.0 {
        return;
    }

    let stroke_width = backdrop.border_thickness * scale;
    let border_alpha = backdrop.opacity * backdrop.border_opacity;
    let mut border_paint = backdrop_paint(&backdrop.border_color, border_alpha, Style::Stroke);
    border_paint.set_stroke_width(stroke_width);
    canvas.draw_circle(
        center,
        (diameter - stroke_width).max(0.0) * 0.5,
        &border_paint,
    );
}

fn draw_rectangle_backdrop(canvas: &Canvas, backdrop: &ValidatedBackdrop, scale: f32) {
    let width = backdrop.width as f32 * scale;
    let height = backdrop.height as f32 * scale;
    let fill_alpha = backdrop.opacity * backdrop.fill_opacity;
    let fill_paint = backdrop_paint(&backdrop.fill_color, fill_alpha, Style::Fill);
    let fill_rect = Rect::from_xywh(backdrop.x, backdrop.y, width, height);

    canvas.draw_rect(fill_rect, &fill_paint);

    if backdrop.border_thickness <= 0.0 {
        return;
    }

    let stroke_width = backdrop.border_thickness * scale;
    let border_alpha = backdrop.opacity * backdrop.border_opacity;
    let mut border_paint = backdrop_paint(&backdrop.border_color, border_alpha, Style::Stroke);
    border_paint.set_stroke_width(stroke_width);
    let stroke_inset = stroke_width * 0.5;
    let stroke_rect = Rect::from_xywh(
        backdrop.x + stroke_inset,
        backdrop.y + stroke_inset,
        (width - stroke_width).max(0.0),
        (height - stroke_width).max(0.0),
    );

    canvas.draw_rect(stroke_rect, &border_paint);
}

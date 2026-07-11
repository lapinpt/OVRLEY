//! Filled-path geometry shared by arc-shaped gauges.
//!
//! This deliberately does not generalize linear gauge geometry: arcs require
//! circular offset curves and endpoint fillets, while linear gauges use RRects.

use crate::normalize::{MAX_ARC_ANGLE_DEGREES, MIN_ARC_ANGLE_DEGREES};
use skia_safe::{Canvas, ClipOp, Paint, Path, PathBuilder, PathFillType, Point};

const PATH_EPSILON: f32 = 0.001;
const QUARTER_CIRCLE_KAPPA: f32 = 0.552_284_76;

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

/// One filled arc-track layer. Empty, filled, border, clear, and shadow layers
/// all use this exact shape; their only difference is the Skia paint supplied
/// to [`draw_arc_track`].
#[derive(Clone, Copy, Debug)]
pub(crate) struct ArcTrackSpec {
    pub geometry: ArcGaugeGeometry,
    pub sweep_angle: f32,
    pub thickness: f32,
    pub start_corner_radius: f32,
    pub end_corner_radius: f32,
}

impl ArcTrackSpec {
    pub(crate) fn full(geometry: ArcGaugeGeometry, thickness: f32, corner_radius: f32) -> Self {
        Self {
            geometry,
            sweep_angle: geometry.sweep_angle,
            thickness,
            start_corner_radius: corner_radius,
            end_corner_radius: corner_radius,
        }
    }

    /// Overrides the cap at the advancing end of the sweep while retaining the
    /// configured start cap.
    pub(crate) fn with_end_corner_radius(self, end_corner_radius: f32) -> Self {
        Self {
            end_corner_radius,
            ..self
        }
    }

    /// Builds an anchored reveal clip for this complete source track. The clip
    /// progresses across the track's visible caps rather than redrawing a tiny
    /// partial track as a full-sized dot.
    fn reveal_clip(self, fill01: f32) -> Option<Self> {
        let fill = fill01.clamp(0.0, 1.0);
        let sweep = self.sweep_angle.clamp(0.0, MAX_ARC_ANGLE_DEGREES);
        let radius = self.geometry.radius.max(0.0);
        if fill <= 0.0 || sweep <= 0.0 || radius <= PATH_EPSILON {
            return None;
        }

        let full_circle = sweep >= MAX_ARC_ANGLE_DEGREES - PATH_EPSILON;
        let half_thickness = self.thickness.max(0.0) * 0.5;
        let start_corner_radius = if full_circle {
            0.0
        } else {
            self.start_corner_radius.clamp(0.0, half_thickness)
        };
        let end_corner_radius = if full_circle {
            0.0
        } else {
            self.end_corner_radius.clamp(0.0, half_thickness)
        };
        let start_cap_angle = arc_cap_angle_degrees(radius, start_corner_radius);
        let end_cap_angle = arc_cap_angle_degrees(radius, end_corner_radius);
        let revealed_sweep = (sweep + start_cap_angle + end_cap_angle) * fill;
        let revealed_end_corner_radius =
            end_corner_radius.min(radius * revealed_sweep.to_radians());
        let revealed_end_cap_angle = arc_cap_angle_degrees(radius, revealed_end_corner_radius);
        let body_sweep = (revealed_sweep - revealed_end_cap_angle).max(PATH_EPSILON);

        Some(Self {
            geometry: ArcGaugeGeometry {
                start_angle: self.geometry.start_angle - start_cap_angle,
                sweep_angle: body_sweep,
                ..self.geometry
            },
            sweep_angle: body_sweep,
            thickness: self.thickness,
            start_corner_radius: 0.0,
            end_corner_radius: revealed_end_corner_radius,
        })
    }

    /// Returns a concentric border shape around this track.
    pub(crate) fn outset(self, border_thickness: f32) -> Self {
        let border = border_thickness.max(0.0);
        Self {
            thickness: self.thickness + border * 2.0,
            start_corner_radius: self.start_corner_radius + border,
            end_corner_radius: self.end_corner_radius + border,
            ..self
        }
    }

    fn filled_path(self) -> Option<Path> {
        let sweep = self.sweep_angle.clamp(0.0, MAX_ARC_ANGLE_DEGREES);
        let half_thickness = self.thickness.max(0.0) * 0.5;
        let outer_radius = self.geometry.radius + half_thickness;
        let inner_radius = self.geometry.radius - half_thickness;
        // A zero sweep is an empty fill, but every positive sweep represents a
        // real value. In particular, a short rounded fill is a cap rather than
        // an empty track, so do not discard it based on a geometric epsilon.
        if sweep <= 0.0 || half_thickness <= PATH_EPSILON || inner_radius <= PATH_EPSILON {
            return None;
        }

        let start = self.geometry.start_angle;
        let mut path = PathBuilder::new_with_fill_type(PathFillType::EvenOdd);
        path.move_to(arc_point(
            self.geometry.center_x,
            self.geometry.center_y,
            outer_radius,
            start,
        ));

        if sweep >= MAX_ARC_ANGLE_DEGREES - PATH_EPSILON {
            append_circular_arc(
                &mut path,
                self.geometry.center_x,
                self.geometry.center_y,
                outer_radius,
                start,
                MAX_ARC_ANGLE_DEGREES,
            );
            path.close();
            path.move_to(arc_point(
                self.geometry.center_x,
                self.geometry.center_y,
                inner_radius,
                start,
            ));
            append_circular_arc(
                &mut path,
                self.geometry.center_x,
                self.geometry.center_y,
                inner_radius,
                start,
                -MAX_ARC_ANGLE_DEGREES,
            );
            path.close();
            return Some(path.detach());
        }

        let end = start + sweep;
        let start_fillet_radius = self.start_corner_radius.clamp(0.0, half_thickness);
        let end_fillet_radius = self.end_corner_radius.clamp(0.0, half_thickness);
        append_circular_arc(
            &mut path,
            self.geometry.center_x,
            self.geometry.center_y,
            outer_radius,
            start,
            sweep,
        );
        append_outer_to_inner_fillet(
            &mut path,
            arc_point(
                self.geometry.center_x,
                self.geometry.center_y,
                self.geometry.radius,
                end,
            ),
            path_tangent(end),
            path_normal(end),
            half_thickness,
            end_fillet_radius,
        );
        append_circular_arc(
            &mut path,
            self.geometry.center_x,
            self.geometry.center_y,
            inner_radius,
            end,
            -sweep,
        );
        let start_tangent = path_tangent(start);
        append_inner_to_outer_fillet(
            &mut path,
            arc_point(
                self.geometry.center_x,
                self.geometry.center_y,
                self.geometry.radius,
                start,
            ),
            Point::new(-start_tangent.x, -start_tangent.y),
            path_normal(start),
            half_thickness,
            start_fillet_radius,
        );
        path.close();
        Some(path.detach())
    }
}

/// Draws a track using the supplied paint. Use `BlendMode::Clear` on the
/// paint to punch out a border interior; the geometry stays identical.
pub(crate) fn draw_arc_track(canvas: &Canvas, spec: ArcTrackSpec, paint: &Paint) {
    if let Some(path) = spec.filled_path() {
        canvas.draw_path(&path, paint);
    }
}

/// Reveals a full source track from its visible start edge through `fill01`.
/// The source preserves its fixed start geometry; the clip controls only how
/// much of that source is visible.
pub(crate) fn draw_revealed_arc_track(
    canvas: &Canvas,
    source: ArcTrackSpec,
    fill01: f32,
    paint: &Paint,
) {
    let Some(clip) = source.reveal_clip(fill01) else {
        return;
    };
    let Some(clip_path) = clip.filled_path() else {
        return;
    };
    canvas.save();
    canvas.clip_path(&clip_path, ClipOp::Intersect, true);
    draw_arc_track(canvas, source, paint);
    canvas.restore();
}

/// Returns the start and end angles for a vertically symmetric arc.
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

fn arc_cap_angle_degrees(radius: f32, corner_radius: f32) -> f32 {
    if radius <= PATH_EPSILON || corner_radius <= 0.0 {
        0.0
    } else {
        corner_radius.atan2(radius).to_degrees()
    }
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
        let start_tangent = path_tangent(angle0);
        let end_tangent = path_tangent(angle1);
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
    if corner_radius <= PATH_EPSILON {
        path.line_to(local_point(origin, tangent, normal, 0.0, -half_thickness));
        return;
    }

    let kappa = corner_radius * QUARTER_CIRCLE_KAPPA;
    let upper_end = local_point(
        origin,
        tangent,
        normal,
        corner_radius,
        half_thickness - corner_radius,
    );
    let lower_start = local_point(
        origin,
        tangent,
        normal,
        corner_radius,
        -half_thickness + corner_radius,
    );
    path.cubic_to(
        local_point(origin, tangent, normal, kappa, half_thickness),
        local_point(
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
        local_point(
            origin,
            tangent,
            normal,
            corner_radius,
            -half_thickness + corner_radius - kappa,
        ),
        local_point(origin, tangent, normal, kappa, -half_thickness),
        local_point(origin, tangent, normal, 0.0, -half_thickness),
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
    if corner_radius <= PATH_EPSILON {
        path.line_to(local_point(origin, tangent, normal, 0.0, half_thickness));
        return;
    }

    let kappa = corner_radius * QUARTER_CIRCLE_KAPPA;
    let lower_end = local_point(
        origin,
        tangent,
        normal,
        corner_radius,
        -half_thickness + corner_radius,
    );
    let upper_start = local_point(
        origin,
        tangent,
        normal,
        corner_radius,
        half_thickness - corner_radius,
    );
    path.cubic_to(
        local_point(origin, tangent, normal, kappa, -half_thickness),
        local_point(
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
        local_point(
            origin,
            tangent,
            normal,
            corner_radius,
            half_thickness - corner_radius + kappa,
        ),
        local_point(origin, tangent, normal, kappa, half_thickness),
        local_point(origin, tangent, normal, 0.0, half_thickness),
    );
}

fn path_tangent(angle: f32) -> Point {
    let radians = angle.to_radians();
    Point::new(-radians.sin(), radians.cos())
}

fn path_normal(angle: f32) -> Point {
    let radians = angle.to_radians();
    Point::new(radians.cos(), radians.sin())
}

fn local_point(origin: Point, tangent: Point, normal: Point, x: f32, y: f32) -> Point {
    Point::new(
        origin.x + tangent.x * x + normal.x * y,
        origin.y + tangent.y * x + normal.y * y,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reveal_clip_handles_zero_and_tiny_fills() {
        let geometry = arc_gauge_geometry(160.0, 160.0, 180.0, 12.0, 2.0);
        let rounded = ArcTrackSpec::full(geometry, 12.0, 6.0);
        let minimum_positive_fill = 0.000_001;

        assert!(rounded.reveal_clip(0.0).is_none());
        assert!(rounded
            .reveal_clip(minimum_positive_fill)
            .and_then(ArcTrackSpec::filled_path)
            .is_some());
        assert!(rounded
            .with_end_corner_radius(0.0)
            .reveal_clip(minimum_positive_fill)
            .and_then(ArcTrackSpec::filled_path)
            .is_some());
    }

    #[test]
    fn reveal_clip_anchors_start_and_rounds_end() {
        let geometry = ArcGaugeGeometry {
            center_x: 80.0,
            center_y: 80.0,
            radius: 64.0,
            start_angle: 180.0,
            sweep_angle: 180.0,
        };
        let source = ArcTrackSpec::full(geometry, 12.0, 6.0);
        let low_fill = source.reveal_clip(0.001).unwrap();
        let halfway = source.reveal_clip(0.5).unwrap();

        assert!(low_fill.geometry.start_angle < geometry.start_angle);
        assert_eq!(low_fill.start_corner_radius, 0.0);
        assert!(low_fill.end_corner_radius > 0.0 && low_fill.end_corner_radius < 6.0);
        assert!((halfway.geometry.start_angle - 174.644).abs() < 0.001);
        assert!((halfway.sweep_angle - 90.0).abs() < 0.001);
        assert_eq!(halfway.end_corner_radius, 6.0);
    }
}

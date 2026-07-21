//! Shared telemetry, fill, and boundary-label helpers for gauges.
//!
//! This module owns the common mapping from a validated metric to its dense
//! series, derives the activity range once during cache preparation, and keeps
//! fill quantization and boundary-label formatting identical across arc and
//! linear renderers.

use crate::activity::schema::DenseSeriesReport;
use crate::types::MetricKind;

/// Maps a metric value into the inclusive normalized gauge range.
///
/// Values outside the range are clamped. A degenerate range has no measurable
/// progress and therefore resolves to zero fill.
pub(crate) fn fill_percentage(value: f64, min: f64, max: f64) -> f32 {
    if max <= min {
        return 0.0;
    }
    ((value - min) / (max - min)).clamp(0.0, 1.0) as f32
}

/// Returns the number of completely filled bars at the supplied progress.
pub(crate) fn bar_fill_count(fill01: f32, count: u32) -> usize {
    (fill01.clamp(0.0, 1.0) * count as f32).floor() as usize
}

/// Derives the finite minimum and maximum for a metric's dense series.
///
/// An absent or constant series uses the documented neutral gauge range so
/// cache preparation still has a usable scale.
pub(crate) fn metric_range(series: &DenseSeriesReport, metric: MetricKind) -> (f64, f64) {
    let mut min_value = f64::INFINITY;
    let mut max_value = f64::NEG_INFINITY;
    for value in metric_values(series, metric).iter().flatten() {
        min_value = min_value.min(*value);
        max_value = max_value.max(*value);
    }
    if min_value.is_finite() && max_value.is_finite() && max_value > min_value {
        (min_value, max_value)
    } else {
        (0.0, 100.0)
    }
}

/// Selects the canonical dense telemetry series for a metric.
///
/// Derived metrics without their own dense series return an empty slice; their
/// presentation range consequently follows [`metric_range`]'s neutral range.
pub(crate) fn metric_values(series: &DenseSeriesReport, metric: MetricKind) -> &[Option<f64>] {
    match metric {
        MetricKind::Speed => &series.speed,
        MetricKind::Distance => &series.distance,
        MetricKind::DistanceToHome => &series.distance_to_home,
        MetricKind::Elevation => &series.elevation,
        MetricKind::Heartrate => &series.heartrate,
        MetricKind::Cadence => &series.cadence,
        MetricKind::Power => &series.power,
        MetricKind::Temperature => &series.temperature,
        MetricKind::Calories => &series.calories,
        MetricKind::Pace => &series.pace,
        MetricKind::GForce => &series.g_force,
        MetricKind::Rpm => &series.rpm,
        MetricKind::ThrottlePosition => &series.throttle_position,
        MetricKind::BrakePosition => &series.brake_position,
        MetricKind::LeanAngle => &series.lean_angle,
        MetricKind::AirPressure => &series.air_pressure,
        MetricKind::GroundContactTime => &series.ground_contact_time,
        MetricKind::StrideLength => &series.stride_length,
        MetricKind::StrokeRate => &series.stroke_rate,
        MetricKind::Torque => &series.torque,
        MetricKind::VerticalSpeed => &series.vertical_speed,
        MetricKind::Altitude => &series.elevation,
        MetricKind::Iso => &series.iso,
        MetricKind::Aperture => &series.aperture,
        MetricKind::ShutterSpeed => &series.shutter_speed,
        MetricKind::FocalLength => &series.focal_length,
        MetricKind::Ev => &series.ev,
        MetricKind::ColorTemperature => &series.color_temperature,
        MetricKind::VerticalRatio => &series.vertical_ratio,
        MetricKind::VerticalOscillation => &series.vertical_oscillation,
        MetricKind::CoreTemperature => &series.core_temperature,
        MetricKind::Heading => &series.heading,
        MetricKind::GearPosition
        | MetricKind::LeftRightBalance
        | MetricKind::Gradient
        | MetricKind::GpsCoordinates
        | MetricKind::TotalAscent
        | MetricKind::Time => &[],
    }
}

/// Formats a min/max label with no decimal for integers and one otherwise.
pub(crate) fn format_gauge_label(value: f64) -> String {
    if value.fract().abs() < f64::EPSILON {
        format!("{value:.0}")
    } else {
        format!("{value:.1}")
    }
}

//! Shared metric-range and fill-fraction helpers for gauge renderers.

use crate::activity::schema::DenseSeriesReport;
use crate::types::MetricKind;

/// Computes the fill fraction for a value within a min-max range.
/// Returns a value clamped between 0.0 and 1.0, or 0.0 if the range is invalid.
pub fn fill_percentage(value: f64, min: f64, max: f64) -> f32 {
    if max <= min {
        return 0.0;
    }
    ((value - min) / (max - min)).clamp(0.0, 1.0) as f32
}

/// Returns the number of whole segments enabled by a clamped fill fraction.
pub fn bar_fill_count(fill01: f32, count: u32) -> usize {
    let fill = fill01.clamp(0.0, 1.0);
    (fill * count as f32).floor() as usize
}

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

pub(crate) fn metric_values(series: &DenseSeriesReport, metric: MetricKind) -> &[Option<f64>] {
    match metric {
        MetricKind::Speed => &series.speed,
        MetricKind::Distance => &series.distance,
        MetricKind::Elevation => &series.elevation,
        MetricKind::Heartrate => &series.heartrate,
        MetricKind::Cadence => &series.cadence,
        MetricKind::Power => &series.power,
        MetricKind::Temperature => &series.temperature,
        MetricKind::Pace => &series.pace,
        MetricKind::GForce => &series.g_force,
        MetricKind::AirPressure => &series.air_pressure,
        MetricKind::GroundContactTime => &series.ground_contact_time,
        MetricKind::StrideLength => &series.stride_length,
        MetricKind::StrokeRate => &series.stroke_rate,
        MetricKind::Torque => &series.torque,
        MetricKind::VerticalSpeed => &series.vertical_speed,
        MetricKind::Altitude => &series.altitude,
        MetricKind::Iso => &series.iso,
        MetricKind::Aperture => &series.aperture,
        MetricKind::ShutterSpeed => &series.shutter_speed,
        MetricKind::FocalLength => &series.focal_length,
        MetricKind::Ev => &series.ev,
        MetricKind::ColorTemperature => &series.color_temperature,
        MetricKind::GearPosition => &series.gear_position,
        MetricKind::VerticalRatio => &series.vertical_ratio,
        MetricKind::VerticalOscillation => &series.vertical_oscillation,
        MetricKind::CoreTemperature => &series.core_temperature,
        MetricKind::Heading => &series.heading,
        MetricKind::LeftRightBalance | MetricKind::Gradient | MetricKind::Time => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::bar_fill_count;

    #[test]
    fn whole_bar_bucket_boundaries_are_discrete() {
        assert_eq!(bar_fill_count(0.0, 5), 0);
        assert_eq!(bar_fill_count(0.1999, 5), 0);
        assert_eq!(bar_fill_count(0.2, 5), 1);
        assert_eq!(bar_fill_count(0.9999, 5), 4);
        assert_eq!(bar_fill_count(1.0, 5), 5);
        assert_eq!(bar_fill_count(1.5, 5), 5);
        assert_eq!(bar_fill_count(0.5, 1), 0);
        assert_eq!(bar_fill_count(1.0, 1), 1);
    }
}

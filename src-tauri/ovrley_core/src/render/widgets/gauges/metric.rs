//! Shared telemetry, fill, and boundary-label helpers for gauges.
//!
//! This module owns the common mapping from a validated metric to its dense
//! series, derives the activity range once during cache preparation, and keeps
//! fill quantization and boundary-label formatting identical across arc and
//! linear renderers.

use crate::activity::schema::{DenseSeriesReport, ParsedActivity};
use crate::normalize::ValidatedGaugeRange;
use crate::render::format::convert_standard_metric_value;
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

/// Derives the finite minimum and maximum for a metric's complete activity.
///
/// An absent or constant series uses the documented neutral gauge range so
/// cache preparation still has a usable scale.
pub(crate) fn metric_range(
    activity: &ParsedActivity,
    metric: MetricKind,
    manual_range: Option<ValidatedGaugeRange>,
) -> (f64, f64) {
    let mut min_value = f64::INFINITY;
    let mut max_value = f64::NEG_INFINITY;
    for value in activity
        .numeric_series_for(metric)
        .unwrap_or(&[])
        .iter()
        .flatten()
    {
        min_value = min_value.min(*value);
        max_value = max_value.max(*value);
    }
    let observed = if min_value.is_finite() && max_value.is_finite() && max_value > min_value {
        Some((min_value, max_value))
    } else {
        None
    };
    resolve_gauge_range(manual_range, metric, observed)
}

pub(crate) fn resolve_gauge_range(
    manual_range: Option<ValidatedGaugeRange>,
    metric: MetricKind,
    observed: Option<(f64, f64)>,
) -> (f64, f64) {
    if let Some(range) = manual_range {
        return (range.min, range.max);
    }
    semantic_gauge_range(metric)
        .or(observed)
        .unwrap_or((0.0, 100.0))
}

fn semantic_gauge_range(metric: MetricKind) -> Option<(f64, f64)> {
    match metric {
        MetricKind::ThrottlePosition | MetricKind::BrakePosition => Some((0.0, 100.0)),
        _ => None,
    }
}

/// Selects the canonical dense telemetry series for a metric.
///
/// Derived metrics without their own dense series return an empty slice; their
/// presentation range consequently follows [`metric_range`]'s neutral range.
pub(crate) fn metric_values(series: &DenseSeriesReport, metric: MetricKind) -> &[Option<f64>] {
    match metric {
        MetricKind::GearPosition
        | MetricKind::LeftRightBalance
        | MetricKind::GpsCoordinates
        | MetricKind::Gradient
        | MetricKind::TotalAscent
        | MetricKind::Time
        | MetricKind::LapTimer => &[],
        metric => series.numeric_series_for(metric).unwrap_or(&[]),
    }
}

/// Converts a raw telemetry min/max value through the selected display unit
/// and rounds it to the nearest integer label.
pub(crate) fn format_gauge_label(
    kind: MetricKind,
    display_unit: Option<&str>,
    value: f64,
) -> String {
    let converted = convert_standard_metric_value(kind, display_unit, value);
    (converted.round() as i64).to_string()
}

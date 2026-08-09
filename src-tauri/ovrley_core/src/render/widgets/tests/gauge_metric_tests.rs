//! Gauge fill-quantization tests.
//!
//! These cases protect range clamping and exact bar activation boundaries.
//! Label formatting is intentionally omitted because it is a thin formatting
//! expression with no meaningful branching contract.

use super::super::gauges::metric::{
    bar_fill_count, fill_percentage, metric_range, semantic_gauge_range,
};
use crate::activity::schema::ParsedActivity;
use crate::types::MetricKind;

#[test]
fn fill_percentage_clamps_and_handles_degenerate_ranges() {
    assert_eq!(fill_percentage(50.0, 0.0, 100.0), 0.5);
    assert_eq!(fill_percentage(-20.0, 0.0, 100.0), 0.0);
    assert_eq!(fill_percentage(120.0, 0.0, 100.0), 1.0);
    assert_eq!(fill_percentage(42.0, 10.0, 10.0), 0.0);
}

#[test]
fn throttle_and_brake_use_their_absolute_percentage_domain() {
    for metric in [MetricKind::ThrottlePosition, MetricKind::BrakePosition] {
        assert_eq!(semantic_gauge_range(metric), Some((0.0, 100.0)));
    }
    assert_eq!(fill_percentage(0.0, 0.0, 100.0), 0.0);
    assert_eq!(fill_percentage(40.0, 0.0, 100.0), 0.4);
    assert_eq!(fill_percentage(100.0, 0.0, 100.0), 1.0);
    assert_eq!(fill_percentage(-1.0, 0.0, 100.0), 0.0);
    assert_eq!(fill_percentage(101.0, 0.0, 100.0), 1.0);

    assert_eq!(semantic_gauge_range(MetricKind::Rpm), None);
}

#[test]
fn gauge_range_uses_untrimmed_activity_observations() {
    let activity: ParsedActivity = serde_json::from_value(serde_json::json!({
        "sample_elapsed_seconds": [0.0, 1.0, 2.0],
        "rpm": [1200.0, 3400.0, 9000.0]
    }))
    .expect("minimal activity JSON must deserialize");

    assert_eq!(metric_range(&activity, MetricKind::Rpm), (1200.0, 9000.0));
}

#[test]
fn whole_bar_bucket_boundaries_are_discrete() {
    assert_eq!(bar_fill_count(0.0, 5), 0);
    assert_eq!(bar_fill_count(0.1999, 5), 0);
    assert_eq!(bar_fill_count(0.2, 5), 1);
    assert_eq!(bar_fill_count(0.9999, 5), 4);
    assert_eq!(bar_fill_count(1.0, 5), 5);
    assert_eq!(bar_fill_count(1.5, 5), 5);
}

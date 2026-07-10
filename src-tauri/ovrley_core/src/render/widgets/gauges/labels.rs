//! Shared gauge label formatting.

/// Formats a gauge boundary value. Integers show no decimal; non-integers show
/// one decimal place.
pub fn format_gauge_label(value: f64) -> String {
    if (value.fract()).abs() < f64::EPSILON {
        format!("{value:.0}")
    } else {
        format!("{value:.1}")
    }
}

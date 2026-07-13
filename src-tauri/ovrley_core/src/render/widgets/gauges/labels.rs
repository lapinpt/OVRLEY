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

#[cfg(test)]
mod tests {
    use super::format_gauge_label;

    #[test]
    fn formats_integer_and_decimal_ranges() {
        assert_eq!(format_gauge_label(10.0), "10");
        assert_eq!(format_gauge_label(10.24), "10.2");
    }
}

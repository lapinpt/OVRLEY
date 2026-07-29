//! Timezone lookup for GPS-backed media telemetry.
//!
//! The finder is initialized once because loading the bundled timezone
//! boundaries is relatively expensive. Coordinates are passed to `tzf-rs` in
//! longitude/latitude order, while [`NativeSample::gps_coordinates`] owns the
//! canonical coordinate validation used by telemetry consumers.

use std::sync::OnceLock;

use tzf_rs::DefaultFinder;

use crate::media::native_sample::NativeSample;

static FINDER: OnceLock<DefaultFinder> = OnceLock::new();

/// Finds the timezone containing the first valid GPS sample.
pub fn timezone_for_samples(samples: &[NativeSample]) -> Option<String> {
    let (longitude, latitude) = samples.iter().find_map(NativeSample::gps_coordinates)?;
    let timezone = FINDER
        .get_or_init(DefaultFinder::new)
        .get_tz_name(longitude, latitude);

    (!timezone.is_empty()).then(|| timezone.to_string())
}

#[cfg(test)]
mod tests {
    use super::timezone_for_samples;
    use crate::media::native_sample::NativeSample;

    #[test]
    fn finds_timezone_from_first_valid_gps_sample() {
        let samples = vec![NativeSample {
            latitude: Some(50.087_465),
            longitude: Some(14.421_254),
            ..NativeSample::default()
        }];

        assert_eq!(
            timezone_for_samples(&samples).as_deref(),
            Some("Europe/Prague")
        );
    }

    #[test]
    fn skips_invalid_gps_samples() {
        let samples = vec![
            NativeSample {
                latitude: Some(0.0),
                longitude: Some(0.0),
                ..NativeSample::default()
            },
            NativeSample {
                latitude: Some(50.087_465),
                longitude: Some(14.421_254),
                ..NativeSample::default()
            },
        ];

        assert_eq!(
            timezone_for_samples(&samples).as_deref(),
            Some("Europe/Prague")
        );
    }
}

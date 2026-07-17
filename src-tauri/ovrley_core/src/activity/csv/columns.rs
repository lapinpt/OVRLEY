//! Canonical activity-column assembly for CSV input.
//!
//! The supporting concerns are split into [`data`], [`timing`], and [`metrics`].
//! This module coordinates those pieces: it builds the canonical timeline,
//! coalesces duplicate-time rows,
//! rebases distance, and assembles the raw columnar contract consumed by the
//! shared activity finalizer.

pub(super) use super::data::CsvColumnData;
use super::headers::{AccelerationKind, HeaderLayout};
use super::metrics::{column_unit, parse_number, selected_acceleration_series, selected_series};
pub(super) use super::timing::LocalPreamble;
use super::timing::{selected_absolute_timestamps, AbsoluteTimestamp};
use super::units::convert;
use super::Metric;
use crate::activity::schema::{ActivityColumns, RawActivityOptions};
use crate::error::{CoreError, CoreResult};
use csv::StringRecord;
use serde_json::json;
use std::ops::Range;

/// Builds canonical raw activity columns from a resolved CSV layout.
///
/// Elapsed time is selected from the best usable elapsed column, with absolute
/// timestamps filling missing rows when available. The resulting timeline is
/// rebased to zero, must not decrease, and must contain at least two distinct
/// samples. Adjacent rows with equal canonical time are reduced by taking the
/// last non-missing value for each metric.
///
/// Direct metric sources are selected by header priority and value usability.
/// Scalar g-force is preferred when present, then derived from semantic
/// lateral/longitudinal acceleration, and finally derived from literal X/Y/Z
/// acceleration after removing the one-g component of gravity. Distance is
/// converted to metres and rebased to the first usable value.
pub(super) fn build_activity_columns(
    header: &HeaderLayout,
    units_row: Option<&StringRecord>,
    data: &CsvColumnData,
    preamble: &LocalPreamble,
    file_name: &str,
) -> CoreResult<ActivityColumns> {
    let elapsed_column = super::metrics::select_column(
        Metric::ElapsedSeconds,
        None,
        &header.columns,
        units_row,
        data,
    );
    let elapsed_unit = elapsed_column
        .map(|column| column_unit(column, units_row).expect("selected elapsed column has a unit"));
    let absolute_timestamps = selected_absolute_timestamps(
        header,
        units_row,
        data,
        preamble,
        elapsed_column,
        elapsed_unit,
    );
    let absolute_seconds = absolute_timestamps
        .iter()
        .map(|value| value.as_ref().map(AbsoluteTimestamp::seconds))
        .collect::<Vec<_>>();
    let absolute_origin = absolute_seconds.iter().flatten().next().copied();
    let source_elapsed = (0..data.len())
        .map(|row| {
            elapsed_column.and_then(|column| {
                parse_number(data.value(row, column.index))
                    .map(|value| convert(value, elapsed_unit.expect("elapsed column has a unit")))
            })
        })
        .collect::<Vec<_>>();
    let absolute_elapsed_anchor =
        absolute_seconds
            .iter()
            .zip(&source_elapsed)
            .find_map(|(absolute, elapsed)| {
                absolute
                    .zip(*elapsed)
                    .map(|(absolute, elapsed)| absolute - elapsed)
            });
    let mut elapsed_seconds = Vec::with_capacity(data.len());
    for (row, (absolute, elapsed)) in absolute_seconds.iter().zip(&source_elapsed).enumerate() {
        let canonical = elapsed.or_else(|| {
            absolute.map(|value| {
                value
                    - absolute_elapsed_anchor
                        .or(absolute_origin)
                        .expect("absolute value has an origin")
            })
        });
        let value = canonical.ok_or_else(|| {
            CoreError::Activity(format!(
                "CSV row {} has neither usable elapsed time nor usable absolute timestamp",
                data.record_index(row) + 1
            ))
        })?;
        elapsed_seconds.push(value);
    }
    if let Some(index) = elapsed_seconds
        .windows(2)
        .position(|pair| pair[0] > pair[1])
    {
        return Err(CoreError::Activity(format!(
            "CSV row {} canonical time must not decrease",
            data.record_index(index + 1) + 1
        )));
    }
    let groups = equal_time_groups(&elapsed_seconds);
    if groups.len() < 2 {
        return Err(CoreError::Activity(
            "CSV activity must contain at least two timed samples".to_string(),
        ));
    }
    let mut elapsed_seconds = groups
        .iter()
        .map(|group| elapsed_seconds[group.start])
        .collect::<Vec<_>>();
    let origin = elapsed_seconds[0];
    elapsed_seconds
        .iter_mut()
        .for_each(|value| *value -= origin);

    let sample_count = groups.len();
    let timestamp = coalesce_series(&absolute_timestamps, &groups)
        .into_iter()
        .map(|value| value.map(|value| value.rfc3339()))
        .collect();
    let series = |metric| {
        coalesce_series(
            &selected_series(metric, &header.columns, units_row, data),
            &groups,
        )
    };
    let g_force_x = series(Metric::GForceX);
    let g_force_y = series(Metric::GForceY);
    let g_force_z = series(Metric::GForceZ);
    let mut g_force_source = selected_series(Metric::GForce, &header.columns, units_row, data);
    if g_force_source.iter().all(Option::is_none) {
        let lateral = selected_acceleration_series(
            Metric::GForceX,
            AccelerationKind::Semantic,
            &header.columns,
            units_row,
            data,
        );
        let longitudinal = selected_acceleration_series(
            Metric::GForceY,
            AccelerationKind::Semantic,
            &header.columns,
            units_row,
            data,
        );
        if let (Some(lateral), Some(longitudinal)) = (lateral, longitudinal) {
            g_force_source = lateral
                .iter()
                .zip(longitudinal)
                .map(|(x, y)| x.zip(y).map(|(x, y)| x.hypot(y)))
                .collect();
        } else {
            let x = selected_acceleration_series(
                Metric::GForceX,
                AccelerationKind::Literal,
                &header.columns,
                units_row,
                data,
            );
            let y = selected_acceleration_series(
                Metric::GForceY,
                AccelerationKind::Literal,
                &header.columns,
                units_row,
                data,
            );
            let z = selected_acceleration_series(
                Metric::GForceZ,
                AccelerationKind::Literal,
                &header.columns,
                units_row,
                data,
            );
            if let (Some(x), Some(y), Some(z)) = (x, y, z) {
                g_force_source = x
                    .iter()
                    .zip(y)
                    .zip(z)
                    .map(|((x, y), z)| {
                        x.zip(y)
                            .zip(z)
                            .map(|((x, y), z)| (x * x + y * y + z * z - 1.0).max(0.0).sqrt())
                    })
                    .collect();
            }
        }
    }
    let g_force = coalesce_series(&g_force_source, &groups);
    let mut distance = series(Metric::Distance);
    if let Some(origin) = distance.iter().flatten().next().copied() {
        distance.iter_mut().for_each(|value| {
            *value = value
                .map(|distance| distance - origin)
                .filter(|distance| *distance >= 0.0)
        });
    }
    let empty = || vec![None; sample_count];

    Ok(ActivityColumns {
        file_name: file_name.to_string(),
        file_format: "csv".to_string(),
        metadata: json!({}),
        options: RawActivityOptions::default(),
        timestamp,
        elapsed_seconds: elapsed_seconds.into_iter().map(Some).collect(),
        latitude: series(Metric::Latitude),
        longitude: series(Metric::Longitude),
        elevation: series(Metric::Elevation),
        altitude: series(Metric::Altitude),
        speed: series(Metric::Speed),
        heading: series(Metric::Heading),
        distance,
        g_force,
        g_force_x,
        g_force_y,
        g_force_z,
        rpm: series(Metric::Rpm),
        throttle_position: series(Metric::ThrottlePosition),
        brake_position: series(Metric::BrakePosition),
        lean_angle: series(Metric::LeanAngle),
        gear_position: series(Metric::GearPosition),
        original_sample_count: data.len(),
        include_original_sample_count_metadata: false,
        heartrate: empty(),
        cadence: empty(),
        power: empty(),
        temperature: empty(),
        gradient: empty(),
        pace: empty(),
        vertical_speed: empty(),
        torque: empty(),
        stroke_rate: empty(),
        stride_length: empty(),
        vertical_oscillation: empty(),
        ground_contact_time: empty(),
        left_right_balance: empty(),
        core_temperature: empty(),
        air_pressure: empty(),
        iso: empty(),
        aperture: empty(),
        shutter_speed: empty(),
        focal_length: empty(),
        ev: empty(),
        color_temperature: empty(),
    })
}

/// Groups adjacent source rows that share exactly the same elapsed time.
///
/// The input must already be in non-decreasing order. Each range identifies
/// one output sample and is later reduced by [`coalesce_series`].
fn equal_time_groups(elapsed_seconds: &[f64]) -> Vec<Range<usize>> {
    let mut groups = Vec::new();
    let mut start = 0;
    for index in 1..elapsed_seconds.len() {
        if elapsed_seconds[index] != elapsed_seconds[start] {
            groups.push(start..index);
            start = index;
        }
    }
    groups.push(start..elapsed_seconds.len());
    groups
}

/// Reduces each equal-time group to its last non-missing series value.
///
/// This lets a later duplicate row update only the fields it supplies while
/// preserving earlier values for fields omitted by that row.
fn coalesce_series<T: Clone>(series: &[Option<T>], groups: &[Range<usize>]) -> Vec<Option<T>> {
    groups
        .iter()
        .map(|group| series[group.clone()].iter().rev().find_map(Clone::clone))
        .collect()
}

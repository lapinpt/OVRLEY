//! Dedicated importer for CSV exports produced by Torque OBD.
//!
//! Torque has stable, source-specific column names such as `Device Time` and
//! `GPS Speed (Meters/second)`. It is therefore recognized before generic CSV
//! parsing and assembled directly into canonical activity columns. The shared
//! finalizer remains the sole owner of cross-format activity semantics.

use crate::activity::finalize::{finalize_activity_columns, FinalizeActivityResponse};
use crate::activity::schema::ActivityColumns;
use crate::error::{CoreError, CoreResult};
use chrono::{DateTime, FixedOffset, NaiveDateTime, SecondsFormat};
use serde_json::json;
use std::fs::File;
use std::io::Read;
use std::path::Path;

const LEGACY_TORQUE_SIGNATURE_COLUMNS: [&str; 2] = ["trip start time", "device time"];
const TORQUE_GPS_SIGNATURE_COLUMNS: [&str; 2] = ["gps time", "device time"];

/// Returns whether a CSV path has the identifying Torque export header.
///
/// Requiring both fields prevents ordinary CSV files that merely happen to
/// contain an OBD metric from being diverted from the generic importer.
pub fn is_torque_activity_path(path: &Path) -> CoreResult<bool> {
    let file = File::open(path).map_err(|source| CoreError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    is_torque_activity_reader(file)
}

/// Opens and parses a signature-verified Torque export.
pub fn parse_torque_activity_path(path: &Path) -> CoreResult<FinalizeActivityResponse> {
    let file = File::open(path).map_err(|source| CoreError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            CoreError::Activity(format!(
                "Torque path has no valid UTF-8 filename: {}",
                path.display()
            ))
        })?;
    parse_torque_activity_reader(file, file_name)
}

/// Detects the Torque signature in a reader without invoking the generic importer.
pub fn is_torque_activity_reader<R: Read>(reader: R) -> CoreResult<bool> {
    let mut records = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(reader)
        .into_records();
    for record in records.by_ref().take(16) {
        let record =
            record.map_err(|error| CoreError::Activity(format!("Invalid Torque CSV: {error}")))?;
        if is_torque_header(&record) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Parses a Torque export and finalizes its canonical activity columns.
pub fn parse_torque_activity_reader<R: Read>(
    reader: R,
    file_name: &str,
) -> CoreResult<FinalizeActivityResponse> {
    let result = (|| {
        let mut records = csv::ReaderBuilder::new()
            .has_headers(false)
            .flexible(true)
            .from_reader(reader)
            .into_records();
        let mut header = None;
        let mut rows = Vec::new();

        for (index, record) in records.by_ref().enumerate() {
            let record = record
                .map_err(|error| CoreError::Activity(format!("Invalid Torque CSV: {error}")))?;
            if header.is_none() {
                if is_torque_header(&record) {
                    header = Some(record);
                }
                continue;
            }
            if record.iter().all(|value| value.trim().is_empty()) {
                continue;
            }
            rows.push((index + 1, record));
        }

        let header = header.ok_or_else(|| {
            CoreError::Activity(
                "Unsupported Torque CSV: missing a recognized Torque timestamp header".into(),
            )
        })?;
        build_activity_columns(&header, &rows, file_name)
            .and_then(|columns| finalize_activity_columns(&columns, None))
    })();
    result.map_err(|error| CoreError::Activity(format!("Torque import '{file_name}': {error}")))
}

fn is_torque_header(record: &csv::StringRecord) -> bool {
    let headers: Vec<_> = record.iter().map(normalize_header).collect();
    let has_legacy_signature = LEGACY_TORQUE_SIGNATURE_COLUMNS
        .iter()
        .all(|required| headers.iter().any(|header| header == required));
    let has_gps_signature = TORQUE_GPS_SIGNATURE_COLUMNS
        .iter()
        .all(|required| headers.iter().any(|header| header == required))
        && headers
            .iter()
            .any(|header| header.starts_with("engine rpm"));
    has_legacy_signature || has_gps_signature
}

fn build_activity_columns(
    header: &csv::StringRecord,
    rows: &[(usize, csv::StringRecord)],
    file_name: &str,
) -> CoreResult<ActivityColumns> {
    let column_index = |predicate: fn(&str) -> bool| {
        header
            .iter()
            .position(|value| predicate(&normalize_header(value)))
    };
    let device_time = column_index(|value| value == "device time")
        .expect("Torque signature includes Device Time");
    let gps_time = column_index(|value| value == "gps time");
    let latitude = column_index(|value| value == "latitude");
    let longitude = column_index(|value| value == "longitude");
    let speed = column_index(|value| value.starts_with("speed (obd)"))
        .or_else(|| column_index(|value| value.starts_with("gps speed")))
        .or_else(|| column_index(|value| value.starts_with("speed (gps)")));
    let elevation = column_index(|value| value.starts_with("gps altitude"));
    let rpm = column_index(|value| value.starts_with("engine rpm") || value.starts_with("rpm"));
    let throttle = column_index(|value| {
        value.starts_with("throttle position")
            || value.starts_with("relative throttle position")
            || value.starts_with("accelerator pedal position")
    });
    let torque = column_index(|value| value.contains("torque"));
    let distance = column_index(|value| value.starts_with("trip distance"));
    let estimated_torque = column_index(|value| value == "estimated torque (nm)");
    let estimated_power_kw = column_index(|value| value == "estimated power (kw)");
    let estimated_power_cv = column_index(|value| value == "estimated power (cv)");
    let estimated_gear = column_index(|value| value == "estimated gear");
    let elapsed_time = column_index(|value| {
        value == "elapsed time"
            || value.starts_with("elapsed time (")
            || value.starts_with("trip time")
    })
    .filter(|index| has_coherent_elapsed_time(rows, *index));

    let mut columns = ActivityColumns {
        file_name: file_name.to_string(),
        file_format: "torque".to_string(),
        metadata: json!({ "source": "Torque" }),
        ..ActivityColumns::default()
    };
    let mut first_time = None;
    let mut first_elapsed = None;
    let mut previous_time = None;
    for (line, row) in rows {
        let timestamp = parse_device_time(cell(row, device_time)).ok_or_else(|| {
            CoreError::Activity(format!("Torque row {line} has an invalid Device Time"))
        })?;
        let elapsed = if let Some(index) = elapsed_time {
            let source_elapsed =
                number(cell(row, index)).expect("coherent elapsed time is numeric");
            let first = *first_elapsed.get_or_insert(source_elapsed);
            source_elapsed - first
        } else {
            let first = *first_time.get_or_insert(timestamp);
            (timestamp - first)
                .num_microseconds()
                .map(|micros| micros as f64 / 1_000_000.0)
                .ok_or_else(|| {
                    CoreError::Activity(format!("Torque row {line} Device Time is out of range"))
                })?
        };
        if previous_time.is_some_and(|previous| elapsed <= previous) {
            return Err(CoreError::Activity(format!(
                "Torque row {line} Device Time must increase strictly"
            )));
        }
        previous_time = Some(elapsed);
        columns.timestamp.push(Some(
            parse_gps_time(cell_opt(row, gps_time))
                .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true))
                .unwrap_or_else(|| {
                    timestamp
                        .and_utc()
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                }),
        ));
        columns.elapsed_seconds.push(Some(elapsed));
        columns
            .latitude
            .push(number(cell_opt(row, latitude)).filter(|value| (-90.0..=90.0).contains(value)));
        columns.longitude.push(
            number(cell_opt(row, longitude)).filter(|value| (-180.0..=180.0).contains(value)),
        );
        columns
            .speed
            .push(number(cell_opt(row, speed)).map(|value| {
                let header = speed
                    .and_then(|index| header.get(index))
                    .unwrap_or_default();
                if normalize_header(header).contains("km/h") {
                    value / 3.6
                } else {
                    value
                }
            }));
        columns.elevation.push(number(cell_opt(row, elevation)));
        columns.rpm.push(number(cell_opt(row, rpm)));
        columns
            .throttle_position
            .push(number(cell_opt(row, throttle)));
        columns.torque.push(number(cell_opt(row, torque)));
        columns
            .estimated_torque
            .push(number(cell_opt(row, estimated_torque)));
        columns
            .estimated_power_kw
            .push(number(cell_opt(row, estimated_power_kw)));
        columns
            .estimated_power_cv
            .push(number(cell_opt(row, estimated_power_cv)));
        columns
            .estimated_gear
            .push(number(cell_opt(row, estimated_gear)));
        columns
            .distance
            .push(number(cell_opt(row, distance)).map(|value| value * 1_000.0));
        push_missing_metrics(&mut columns);
    }
    if columns.elapsed_seconds.len() < 2 {
        return Err(CoreError::Activity(
            "Torque CSV needs at least two timed samples".into(),
        ));
    }
    columns.sync_time = columns.timestamp.first().and_then(Clone::clone);
    columns.original_sample_count = columns.elapsed_seconds.len();
    Ok(columns)
}

/// Keeps every optional finalizer input aligned to the Torque timeline.
fn push_missing_metrics(columns: &mut ActivityColumns) {
    macro_rules! numeric { ($($field:ident),+ $(,)?) => { $(columns.$field.push(None);)+ }; }
    numeric!(
        barometric_altitude,
        heading,
        heartrate,
        cadence,
        power,
        temperature,
        calories,
        gradient,
        pace,
        distance_to_home,
        g_force,
        g_force_x,
        g_force_y,
        g_force_z,
        brake_position,
        lean_angle,
        vertical_speed,
        stroke_rate,
        stride_length,
        vertical_oscillation,
        ground_contact_time,
        left_right_balance,
        core_temperature,
        air_pressure,
        iso,
        aperture,
        shutter_speed,
        focal_length,
        ev,
        color_temperature,
    );
    columns.gear_position.push(None);
}

fn cell(row: &csv::StringRecord, index: usize) -> &str {
    row.get(index).unwrap_or("")
}
fn cell_opt(row: &csv::StringRecord, index: Option<usize>) -> &str {
    index.and_then(|index| row.get(index)).unwrap_or("")
}
fn number(value: &str) -> Option<f64> {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
}

fn has_coherent_elapsed_time(rows: &[(usize, csv::StringRecord)], index: usize) -> bool {
    let values = rows
        .iter()
        .map(|(_, row)| number(cell(row, index)))
        .collect::<Option<Vec<_>>>();
    values
        .is_some_and(|values| values.len() >= 2 && values.windows(2).all(|pair| pair[0] < pair[1]))
}

fn parse_device_time(value: &str) -> Option<NaiveDateTime> {
    let localized_value = value
        .trim()
        .replace("jan.", "Jan")
        .replace("fev.", "Feb")
        .replace("mar.", "Mar")
        .replace("abr.", "Apr")
        .replace("mai.", "May")
        .replace("jun.", "Jun")
        .replace("jul.", "Jul")
        .replace("ago.", "Aug")
        .replace("set.", "Sep")
        .replace("out.", "Oct")
        .replace("nov.", "Nov")
        .replace("dez.", "Dec");
    [
        "%m-%d-%Y %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y/%m/%d %H:%M:%S%.f",
        "%d-%b-%Y %H:%M:%S%.f",
    ]
    .into_iter()
    .find_map(|format| NaiveDateTime::parse_from_str(&localized_value, format).ok())
}

fn parse_gps_time(value: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_str(value.trim(), "%a %b %d %H:%M:%S GMT%:z %Y").ok()
}

fn normalize_header(value: &str) -> String {
    value
        .trim_start_matches('\u{feff}')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

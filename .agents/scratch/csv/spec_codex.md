# CSV Activity Import Specification

Status: Ready for implementation planning  
Last updated: 2026-07-16

## 1. Summary

OVRLEY will import motorsport CSV activity files selected in the frontend and parse them natively in Rust with the established `csv` crate. CSV data will remain columnar in Rust:

```text
frontend-selected CSV path
        |
        v
Tauri CSV import command
        |
        v
Rust csv crate
        |
        v
header, unit, and source resolver
        |
        v
ActivityColumns
        |
        v
finalize_activity_columns()
        |
        v
ParsedActivity returned to the frontend
```

CSV import must not create row-oriented `RawActivity`, serialize it to JSON, and deserialize it back into Rust. `ActivityColumns` is the canonical native seam, matching the existing MP4 telemetry path.

This specification supersedes the vendor-specific parser recommendation in `analysis.md`. CSV support is capability-based: it recognizes understood columns and units without requiring reliable exporter or version detection.

## 2. Scope

The implementation must support every CSV fixture under:

```text
src-tauri/ovrley_core/tests/fixtures/activity/
```

The in-scope fixtures are:

- `Amozoc - TrackAddict.csv`
- `sample AiM.csv`
- `sample LapLegend.csv`
- `sample Racebox.csv`
- `sample RaceChrono.csv`
- `session_20260713_185859_v1.csv`
- `session_20260713_185859_v2.csv`

The following telemetry must be extracted when an understood source column is available:

- Elapsed seconds
- Absolute timestamp
- Latitude and longitude
- Speed
- Cumulative distance
- Elevation and altitude
- Heading or bearing
- Scalar g-force
- G-force x, y, and z
- Gear
- RPM
- Throttle position
- Brake position
- Lean angle

All other telemetry columns are ignored in this pass.

## 3. Non-goals

- Parsing GPX, FIT, SRT, IGC, video telemetry, or any other non-CSV format differently.
- Detecting or dispatching on a specific CSV exporter dialect.
- Supporting delimiter sniffing, semicolon-delimited files, or tab-separated files.
- Preserving general exporter/session preamble metadata.
- Adding widgets, manifest entries, renderer requirements, frontend formatting, or editors for the newly retained motorsport metrics.
- Adding new metrics found in the fixtures but omitted from the required list.
- Repairing decreasing timelines, guessing missing record times, or inventing sample spacing.
- Reimplementing CSV quoting, escaping, or record parsing outside the Rust `csv` crate.

## 4. Architectural Boundaries

### 4.1 Frontend

- Add `csv` to the native activity file-picker filter and browser accept list where applicable.
- Keep the native path returned by the Tauri file picker for CSV imports.
- Route a selected CSV path directly to a dedicated backend API function.
- Do not read native CSV bytes into JavaScript or wrap them in a browser `File`.
- Continue using the existing frontend parsers and `RawActivity` finalization flow for GPX, FIT, SRT, and IGC.
- Activate the returned `ParsedActivity` through the existing activity-store workflow.

### 4.2 Tauri shell

Add a narrow command conceptually equivalent to:

```rust
backend_parse_csv_activity(path: String) -> Result<String, String>
```

The command delegates parsing and finalization to `ovrley_core` and serializes only the finalized response crossing IPC. It does not contain CSV-domain parsing rules.

### 4.3 Rust core

Add `csv` as a direct dependency of `ovrley_core`.

The core CSV module owns:

- Opening or accepting a reader for the selected file.
- Reading comma-delimited CSV records.
- Locating the telemetry header.
- Reading a separate units row when present.
- Resolving understood columns, source qualifiers, and units.
- Selecting one source column per canonical metric.
- Converting source values into canonical units.
- Aligning and coalescing records into `ActivityColumns`.
- Calling the existing `finalize_activity_columns()` path.

The core parser should expose a reader-oriented seam for unit tests and a path-oriented entry point for production and fixture tests.

Use a focused module layout under `src-tauri/ovrley_core/src/activity/csv/`:

- `mod.rs` owns the public reader/path entry points and finalization handoff.
- `headers.rs` owns header discovery, units-row recognition, alias lookup, and source priority.
- `units.rs` owns canonical unit resolution and conversion.
- `columns.rs` owns aligned column construction, timing, coalescing, rebasing, and CSV-specific derivation.

Keep these boundaries pragmatic: helpers may remain together when splitting them would not create a clearer ownership boundary.

## 5. Canonical Schema Changes

### 5.1 Existing fields used by CSV

CSV import populates these existing `ActivityColumns` and `ParsedActivity` concepts:

```text
timestamp
elapsed_seconds
latitude
longitude
elevation
altitude
speed
heading
distance
g_force
gear_position
```

### 5.2 New fields

Add the following canonical numeric series to `ActivityColumns` and `ParsedActivity`:

```text
g_force_x
g_force_y
g_force_z
rpm
throttle_position
brake_position
lean_angle
```

Canonical units are:

| Field | Canonical unit |
| --- | --- |
| `g_force_x` | g |
| `g_force_y` | g |
| `g_force_z` | g |
| `rpm` | revolutions per minute |
| `throttle_position` | percent, `0..=100` |
| `brake_position` | percent, `0..=100` |
| `lean_angle` | degrees |

RPM remains a vehicle metric. It must not be mapped into activity `cadence`.

The finalizer must:

- Validate the length of each new `ActivityColumns` series.
- Retain each series explicitly in `ParsedActivity`.
- Include each metric in coverage, units, and extended-attribute availability.
- Serialize missing samples as JSON `null` through Rust `Option<f64>::None`.

This pass does not add the new fields to `TrimmedActivity`, `DenseActivityReport`, render-data requirements, standard metric manifests, or frontend widget code.

## 6. CSV Record Parsing

### 6.1 CSV syntax

- Use the Rust `csv` crate.
- Configure comma as the only delimiter.
- Honor standard CSV quoting and embedded commas.
- Accept UTF-8 BOM, blank lines, comments/preamble rows, and reasonable record-width variation.
- Missing metric cells become `None`.
- Extra fields not represented by selected headers are ignored.
- An unreadable file or malformed CSV syntax fails the import.

### 6.2 Header discovery

Preamble length and record width vary by exporter. A telemetry header candidate must contain:

- At least one recognized timing basis; and
- At least one recognized in-scope telemetry metric.

AiM's preamble row `"Time","8:30 AM"` therefore cannot qualify as a telemetry header.

If no telemetry header qualifies, fail with an unsupported/unusable CSV error. If multiple records independently qualify as telemetry headers, fail as ambiguous rather than guessing.

### 6.3 Header normalization

Normalize only superficial syntax before matching:

- Case
- Unicode BOM and whitespace
- Leading/trailing whitespace
- Repeated spaces
- Underscore and hyphen separators
- CSV quoting, which is already decoded by the `csv` crate

Then parse recognized unit annotations and source qualifiers independently. Source qualifiers include concepts such as GPS, OBD, calculated, accelerometer, vehicle, and logger.

The remaining semantic name is matched against an explicit exact-alias registry. Do not use substring or fuzzy matching. For example, `Distance on GPS Speed` must resolve to distance, not speed.

Unknown headers are ignored.

### 6.4 Units row

When a separate units row exists, such as AiM's row following the telemetry header, parse and use it.

Detect a units row by testing its cells against the selected header columns: the non-empty cells must be recognized units compatible with those columns. Do not classify a row as units merely because most cells are short, nonnumeric strings. If the row does not satisfy the compatibility check, treat it as the first data record.

Unit resolution is:

1. If the header and units row both declare the same understood unit, use it.
2. If only one declares an understood unit, use it.
3. If neither declares a unit, use the metric default.
4. If a present declared unit is unsupported, ignore that column and try the next source for the metric.
5. If the header and units row contradict each other, ignore that column and try the next source.

An absent unit permits a documented default. An explicitly unsupported unit must never be treated as though it were absent.

### 6.5 Default source units

| Source concept without a declared unit | Default |
| --- | --- |
| Time or elapsed time | seconds |
| Latitude or longitude | decimal degrees |
| Speed | kilometres per hour |
| Distance | metres |
| Elevation or altitude | metres |
| Heading or bearing | degrees |
| Scalar or component acceleration | g |
| Gear | raw numeric position |
| RPM | revolutions per minute |
| Throttle or brake position | percent, subject to binary inference |
| Lean angle | degrees |

Explicit units always override these defaults.

## 7. Column Selection

Exactly one source column is selected for each canonical metric. Values must not be combined row-by-row across different sensor sources because that would silently switch sensors during an activity.

Selection uses a metric-specific ordered registry. Within the same priority, take the first matching column containing at least one valid value. No coverage scoring is required.

### 7.1 Priority principles

| Metric | Priority principle |
| --- | --- |
| Elapsed time | Explicit elapsed-time channel, otherwise recognized elapsed `Time`/`Timestamp` |
| Absolute timestamp | Explicit UTC/Unix channel, paired absolute `Time (s)`, then assumed-local construction |
| Latitude/longitude | GPS-position channel, then unqualified position channel |
| Speed | Direct GPS/device speed, calculated GPS speed, then OBD/vehicle speed |
| Distance | Direct GPS/cumulative distance, then unqualified cumulative distance |
| Elevation | GPS/device/bare elevation or altitude |
| Altitude | Explicit pressure/barometric altitude only |
| Heading | GPS/direct heading or bearing, then calculated heading |
| Scalar g-force | Direct scalar/combined/XYZ channel, then derived scalar |
| G-force axes | Dedicated accelerometer/logger axes, then semantic/calculated axes |
| Gear/RPM/throttle/brake | Direct vehicle logger, CAN, or OBD channel before calculated channels |
| Lean angle | Direct lean angle, then calculated lean angle |

For speed, GPS is preferred over OBD. OBD speed may be consistent but commonly carries a fixed vehicle calibration error and consumes shared OBD polling bandwidth. OBD/CAN remains preferred for vehicle-state metrics such as RPM, throttle, brake, and gear.

### 7.2 Initial alias-registry seed

Seed the exact-alias registry with the fixture headers below. Unit annotations and source qualifiers are parsed separately, so the registry may store normalized semantic bases plus qualifier rules rather than every literal spelling.

| Canonical metric | Initial fixture aliases/source forms |
| --- | --- |
| Elapsed time | `Time`, `Elapsed time`, `Timestamp` |
| Absolute timestamp | `UTC Time`; paired `Time (s)` when `Elapsed time (s)` is also present |
| Latitude | `Latitude`, `GPS Latitude` |
| Longitude | `Longitude`, `GPS Longitude` |
| Speed | `Speed`, `GPS Speed`, `KPH`, `Vehicle Speed`, `VehSpd1`, calculated speed, OBD speed |
| Distance | `Distance`, `GPS Distance 2D`, `Distance on GPS Speed` |
| Elevation | `Elevation`, `Altitude`, `GPS Altitude` |
| Altitude | `Pressure Altitude`, `Barometric Altitude` |
| Heading | `Heading`, `Bearing`, `GPS Heading` |
| Scalar g-force | `Accel XYZ`, `Combined acceleration` |
| G-force axes | `Accel X/Y/Z`, `X/Y/Z acceleration`, `LateralAcc`, `InlineAcc`, `VerticalAcc`, lateral acceleration, longitudinal acceleration |
| RPM | `RPM`, `Engine RPM` |
| Throttle position | `Accelerator position`, `Accelerator Pedal Position`, `Throttle Position`, `Throttlepos` |
| Brake position | `Brake position`, `Brake Pedal`, `Brake (calculated)`, `Braking` |
| Lean angle | `Lean angle` |
| Gear position | `Gear`, `CalculatedGear` |

This seed is not a dialect table. Matching still follows normalized exact aliases, declared/default units, and the metric-specific priority registry.

### 7.3 Equivalent unit columns

If a source exports the same metric in several units, such as RaceChrono speed in m/s, km/h, and mph, selecting any first valid column at the same priority is acceptable because all are normalized to the same canonical unit.

## 8. Timing Contract

Timing is structural. Every accepted data record must contain either:

- A valid elapsed-time value; or
- A valid absolute timestamp from which elapsed time can be derived.

If a record contains neither, fail the entire import with its CSV row number. Do not drop the record or invent timing.

The finalized CSV activity must contain at least two timed samples.

### 8.1 Timeline mapping

Use the following narrow semantic rules; do not add general numeric-magnitude inference:

- Bare `Time` or `Timestamp` means elapsed seconds.
- `Elapsed time (s)` means elapsed seconds.
- `UTC Time` means Unix epoch seconds.
- When `Time (s)` and `Elapsed time (s)` both exist, elapsed time drives the activity timeline and `Time (s)` supplies the absolute timestamp.
- `Timestamp (s)` plus usable local date metadata may construct an assumed-local absolute timestamp.
- ISO/RFC date-time strings are parsed as absolute timestamps when their offset is explicit.

Rebase elapsed time so the first accepted sample is exactly `0`.

### 8.2 Timezone-less timestamps

Explicit Unix/UTC timestamps are authoritative.

For AiM date/time metadata and RaceChrono v1 local date metadata without a timezone:

- Interpret the recording date/time using the importing computer's local timezone for that historical date, including DST.
- Use the result to give autosync a reasonable opportunity.
- If the local time is invalid or DST-ambiguous, omit absolute timestamps instead of making another guess.
- The local date/time preamble is consumed transiently and is not retained as general activity metadata.

Files with only elapsed time and no usable recording date keep `timestamp` absent.

### 8.3 Ordering and equal-time records

- Decreasing canonical time fails the import.
- Adjacent records with equal canonical time are coalesced into one sample.
- For each selected metric, the last non-`None` value wins within the equal-time group.
- Exact duplicate records collapse naturally under the same rule.
- The number of coalesced rows is not recorded in metadata.
- The completed `ActivityColumns` timeline must be strictly increasing.

The equal-time rule is required by `session_20260713_185859_v2.csv`, which contains legitimate adjacent duplicate timestamps.

## 9. Metric Normalization

### 9.1 Missing and malformed observations

CSV telemetry is sparse observational activity data. At ingress:

- Blank cells become `None`.
- Known absence markers such as `N/A`, `NA`, and `null` become `None`.
- Nonnumeric, non-finite, or otherwise malformed metric values become `None`.
- A malformed metric observation does not fail the activity import.
- Timing remains subject to the stricter structural contract in section 8.

In Rust the absence is `None`; when finalized activity crosses IPC it serializes as JSON `null`.

### 9.2 Bounded values

Do not clamp invalid observations. Convert them to `None`.

| Metric | Valid domain |
| --- | --- |
| Latitude | `-90..=90` |
| Longitude | `-180..=180` |
| Throttle position | `0..=100` |
| Brake position | `0..=100` |
| RPM | `>= 0` |
| Cumulative distance | `>= 0` |

Gear may be negative because reverse can be represented numerically. Altitude, elevation, lean angle, and acceleration axes may legitimately be negative.

Normalize heading and bearing modulo 360 into `0..<360`; signed bearings are a legitimate source representation rather than invalid data.

### 9.3 Unit conversions

Perform conversions once in the CSV adapter. At minimum:

- km/h to m/s: divide by `3.6`
- mph to m/s: multiply by `0.44704`
- kilometres to metres: multiply by `1000`
- feet to metres: multiply by `0.3048`
- milliseconds to seconds when explicitly declared

Consumers and the shared finalizer must not repeat CSV unit detection or conversion.

### 9.4 Elevation and altitude

- GPS, device, bare `Altitude`, and `Elevation` columns populate `elevation`.
- Explicit pressure or barometric altitude populates `altitude`.
- A single height source is not duplicated into both series.
- Both series are retained independently when both source types exist.

### 9.5 Distance

The selected cumulative-distance stream is rebased alongside elapsed time:

```text
canonical_distance = source_distance - first_valid_source_distance
```

All in-scope fixtures containing direct cumulative distance are non-decreasing. No CSV-specific lap-reset stitching is included in this pass.

When no usable direct distance column exists, leave the direct series absent and allow the existing finalizer to derive cumulative distance from latitude/longitude using its standard haversine path. The CSV adapter must not duplicate that derivation.

### 9.6 Acceleration axes

Map semantic axes as follows:

```text
lateral              -> g_force_x
longitudinal/inline   -> g_force_y
vertical              -> g_force_z
```

Explicit X/Y/Z columns map directly to `g_force_x/y/z`. Preserve the source sign; do not rotate or invert axes.

### 9.7 Scalar g-force

Scalar selection is:

1. Prefer a recognized direct scalar, combined acceleration, or XYZ magnitude channel.
2. Otherwise derive from recognized lateral and longitudinal channels when available.
3. Otherwise derive from x/y/z accelerometer channels.

Scalar g-force uses a dynamic, zero-at-rest meaning.

For semantic lateral and longitudinal components:

```text
g_force = sqrt(lateral^2 + longitudinal^2)
```

For generic gravity-inclusive x/y/z accelerometer components:

```text
g_force = sqrt(max(x^2 + y^2 + z^2 - 1, 0))
```

The three-axis formula is an explicit fallback and is not allowed to replace a supplied scalar/combined channel.

### 9.8 Throttle and brake

Canonical throttle and brake series are percentages from `0` through `100`.

- For `throttle_position`, prefer accelerator-pedal/accelerator-position columns over generic throttle-body position columns. A generic `Throttle Position` remains valid when no accelerator-pedal source exists.
- Headers containing `position`, `pedal`, or `%` are percentages.
- Headers indicating `state`, `on/off`, or `braking` are binary.
- Otherwise, an undeclared-unit column whose every valid value is exactly `0` or `1` is inferred as binary.
- Other unitless throttle/brake columns default to percentage.
- Binary `0` becomes `0%`; binary `1` becomes `100%`.
- Never change interpretation within one source column.
- Brake-pressure columns are not brake-position aliases and are ignored in this pass.

## 10. Preamble Handling

General preamble fields, comments, exporter identity, session name, vehicle, racer, track, and other metadata are ignored and are not copied into `ParsedActivity` metadata.

The only preamble exception is transient use of recognized date/time fields needed for the assumed-local timestamp policy. Those values are consumed for timestamp construction and otherwise discarded.

## 11. Failure Semantics

| Condition | Required result |
| --- | --- |
| File cannot be opened/read | Fail import |
| Malformed CSV syntax | Fail import |
| No usable telemetry header | Fail import |
| Ambiguous telemetry header | Fail import |
| No recognized telemetry metric | Fail import |
| Fewer than two timed samples | Fail import |
| Record lacks both elapsed and absolute time | Fail import with row context |
| Canonical timeline decreases | Fail import with row context |
| Equal timestamps | Coalesce records |
| Metric cell is blank/malformed/non-finite | Store `None` |
| Bounded metric is outside its domain | Store `None` |
| Unknown header | Ignore column |
| Unsupported/conflicting declared unit | Ignore column and try next source |
| General preamble data | Ignore |

Errors should identify the selected file and, when applicable, the CSV record and offending timing/header condition. The existing frontend import error path presents the backend message.

## 12. Implementation Plan

### 12.1 Core schema and finalizer

1. Add the seven new numeric series to `ActivityColumns` and `ParsedActivity`.
2. Extend `ActivityColumns` length validation.
3. Extend direct metric collection and final `ParsedActivity` assembly.
4. Extend metric units, coverage, and extended attributes.
5. Keep renderer-facing trim/dense schemas and manifests unchanged.

### 12.2 CSV core module

1. Add the `csv` crate dependency.
2. Introduce reader- and path-based CSV parsing entry points.
3. Implement telemetry-header discovery and optional units-row recognition.
4. Implement normalized exact alias, source qualifier, unit, and priority registries.
5. Select one source per metric.
6. Stream records into aligned column builders, applying conversions and `None` normalization.
7. Build canonical timing, coalesce equal-time records, and validate ordering.
8. Rebase elapsed time and cumulative distance.
9. Derive scalar g-force only when no supplied scalar exists.
10. Produce `ActivityColumns` and call `finalize_activity_columns()`.

### 12.3 Tauri command

1. Add the path-based CSV parse/finalize command.
2. Delegate domain work to `ovrley_core`.
3. Register the command in the Tauri invoke handler.
4. Return the existing finalized response shape.

### 12.4 Frontend integration

1. Add `.csv` to activity selection filters.
2. Preserve the native selected path for CSV.
3. Add the backend API wrapper for CSV parsing.
4. Route CSV imports to Rust while leaving existing file parsers unchanged.
5. Feed the returned parsed activity through the existing store activation and scene-timing workflow.

## 13. Testing Requirements

### 13.1 Rust unit tests

- Header normalization without fuzzy/substring false positives.
- Telemetry-header discovery through variable preambles.
- AiM separate units-row handling.
- Missing-unit defaults.
- Unsupported and conflicting declared-unit column rejection.
- Metric-specific source priority, especially GPS versus calculated versus OBD speed.
- m/s, km/h, mph, metres, kilometres, and feet conversions.
- Binary versus percentage throttle/brake handling.
- Bounds validation to `None` without clamping.
- Semantic and explicit acceleration-axis mapping.
- Direct scalar g-force priority.
- Lateral/longitudinal scalar derivation.
- Gravity-compensated x/y/z scalar derivation.
- Elapsed, UTC epoch, paired `Time`/`Elapsed time`, and assumed-local timestamp handling.
- Elapsed and distance rebasing.
- Equal-time coalescing with last non-`None` values.
- Failure on untimed rows and decreasing time.
- Malformed metric cells becoming `None`.
- Ignoring unrelated columns and general preamble data.

### 13.2 Fixture integration tests

Every in-scope CSV fixture must:

- Parse through the reader/path CSV entry point.
- Build aligned `ActivityColumns`.
- Finalize through `finalize_activity_columns()`.
- Produce a strictly increasing, zero-based elapsed timeline.
- Produce zero-based cumulative distance when direct distance exists.
- Populate every recognized required metric in canonical units.
- Preserve new unsupported-in-UI metrics in `ParsedActivity`.
- Contain only finite numeric values or `None` in metric series.

Add targeted assertions for each fixture's distinctive behavior, including:

- TrackAddict UTC timestamps and calculated brake.
- AiM units row, GPS speed, logger axes, gear, RPM, throttle, and distance.
- Lap Legend scalar XYZ acceleration, pedal channels, RPM, GPS distance, and elevation.
- RaceBox unitless shorthand, elapsed time, coordinates, speed, elevation, and axes.
- RaceChrono v2 source priorities, timestamps, lean, combined acceleration, OBD vehicle metrics, and accelerometer axes.
- RaceChrono v1 assumed-local time, seconds-since-midnight timing, distance, RPM, and throttle.
- RaceChrono v2 equal-time record coalescing.

### 13.3 Tauri/frontend tests

- CSV picker filter inclusion.
- Native CSV paths are sent directly to the CSV backend command.
- CSV bytes are not read into a frontend `File` first.
- Existing GPX/FIT/SRT/IGC routing remains unchanged.
- Successful CSV finalization activates the activity through the existing store path.
- Backend CSV errors reach the existing activity-import error UI.

## 14. Acceptance Criteria

1. Every in-scope CSV fixture imports through Rust's `csv` crate and the native `ActivityColumns` finalization path.
2. CSV import performs no `RawActivity` JSON round trip.
3. The frontend sends the selected native CSV path to Rust rather than transferring the complete file through JavaScript.
4. Parsing does not depend on identifying an exporter dialect or version.
5. Understood headers and units map once into canonical field names and units; unrelated columns are ignored.
6. One source is selected per metric using the metric-specific priority registry.
7. Every accepted record has real source timing, and the resulting timeline is zero-based and strictly increasing.
8. Equal-time fixture records are coalesced without recording a coalesced-row count.
9. Missing or malformed metric observations become Rust `None` and serialized JSON `null` without failing the import.
10. Speed is canonical m/s, distance and height are metres, heading is normalized degrees, controls are percentages, and acceleration is g.
11. Direct scalar g-force wins; fallback scalar g-force is zero at rest and follows the agreed formulas.
12. `g_force_x`, `g_force_y`, `g_force_z`, `rpm`, `throttle_position`, `brake_position`, and `lean_angle` exist in finalized `ParsedActivity` even though no current frontend manifest or widget consumes them.
13. Existing non-CSV activity import behavior remains unchanged.

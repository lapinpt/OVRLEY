# CSV Activity Import PRD

Status: ready-for-agent  
Last updated: 2026-07-16

## Problem Statement

OVRLEY cannot currently import motorsport telemetry stored in CSV files. Users may have useful activity data from TrackAddict, AiM, Lap Legend, RaceBox, RaceChrono, and similar exporters, but CSV layouts vary in their preambles, header spelling, source qualifiers, unit placement, duplicate channels, and missing observations. Requiring a rigid exporter dialect would make support brittle, while guessing at unknown columns or units could produce misleading telemetry.

The existing frontend-based activity parsers are also the wrong processing boundary for large CSV files. Reading a large native CSV into JavaScript, converting it to row-oriented raw samples, serializing it over IPC, and reshaping it back into Rust columns would add avoidable memory and serialization costs. CSV should instead enter through the native Rust columnar path already used by backend-created telemetry.

OVRLEY also lacks canonical finalized fields for several important motorsport metrics: acceleration axes, RPM, throttle position, brake position, and lean angle. These metrics must be retained now even though current widgets and the metric manifest cannot display them yet.

## Solution

Add a native CSV activity-import path. The frontend will allow CSV selection and send the selected native path to a dedicated Tauri command. Rust will stream the file through the established `csv` crate, locate a usable telemetry header, resolve recognized columns through a capability-based alias and source-priority registry, normalize units once, and construct aligned `ActivityColumns` directly.

The CSV path will then invoke the existing shared columnar finalizer and return the finalized `ParsedActivity` to the frontend for normal activation. It will not construct or transfer `RawActivity` JSON.

The parser will be permissive about sparse or malformed metric observations: they become missing values. It will remain strict about structure required to build an activity, especially usable timing. Unknown metrics and unsupported declared units are ignored without preventing other understood telemetry from importing.

The finalized activity schema will explicitly retain g-force x/y/z, RPM, throttle position, brake position, and lean angle. Renderer, manifest, and widget support for these fields is deferred.

## User Stories

1. As an OVRLEY user, I want to select a CSV activity file from the existing activity import control, so that I can use motorsport telemetry without converting it to GPX or FIT first.
2. As an OVRLEY user, I want large CSV files to be read directly by Rust, so that import does not unnecessarily duplicate the entire file in JavaScript and IPC memory.
3. As an OVRLEY user, I want CSV parsing to work from recognized columns rather than a fragile exporter-version check, so that harmless exporter metadata or column-order changes do not break import.
4. As an OVRLEY user, I want unrelated CSV columns to be ignored, so that a file can contain diagnostics and vehicle channels OVRLEY does not yet understand.
5. As an OVRLEY user, I want files with comments and variable-length preambles to import, so that exporter session information before the telemetry table does not block parsing.
6. As an OVRLEY user, I want a separate units row to be honored, so that headers such as AiM's `GPS Speed` are converted using their declared units.
7. As an OVRLEY user, I want units embedded in headers to be honored, so that m/s, km/h, mph, metres, kilometres, and feet are converted correctly.
8. As an OVRLEY user, I want understood columns without units to use documented motorsport defaults, so that common shorthand such as `KPH` or bare altitude remains useful.
9. As an OVRLEY user, I want a column with an explicitly unsupported unit to be ignored rather than misinterpreted, so that a default is never applied over contradictory source information.
10. As an OVRLEY user, I want the parser to choose one source for each metric, so that an activity does not silently switch between sensors from row to row.
11. As an OVRLEY user, I want GPS speed preferred over calculated and OBD speed, so that the displayed activity uses the most relevant speed source available.
12. As an OVRLEY user, I want logger, CAN, or OBD vehicle channels preferred for RPM, throttle, brake, and gear, so that those metrics reflect actual vehicle state.
13. As an OVRLEY user, I want accelerator-pedal position preferred over generic throttle-body position, so that throttle telemetry represents driver input when both sources exist.
14. As an OVRLEY user, I want latitude and longitude converted into canonical decimal degrees, so that route and derived-distance behavior works normally.
15. As an OVRLEY user, I want speed converted into metres per second, so that CSV activities use the same canonical unit as every other activity source.
16. As an OVRLEY user, I want cumulative distance converted into metres and rebased to zero, so that it describes the imported activity interval rather than an earlier session offset.
17. As an OVRLEY user, I want distance derived through the existing GPS-coordinate workflow when no usable direct distance column exists, so that the CSV adapter does not duplicate standard finalizer behavior.
18. As an OVRLEY user, I want GPS and general height channels to populate elevation, so that existing route, elevation, and gradient workflows can use them.
19. As an OVRLEY user, I want explicit pressure altitude retained separately from elevation, so that distinct physical height sources are not collapsed or duplicated.
20. As an OVRLEY user, I want heading and bearing normalized into the canonical circular degree range, so that signed source bearings render consistently later.
21. As an OVRLEY user, I want supplied combined or scalar g-force preferred, so that source-computed acceleration is not replaced by an approximation.
22. As an OVRLEY user, I want scalar g-force derived from lateral and longitudinal acceleration when no scalar exists, so that useful acceleration remains available.
23. As an OVRLEY user, I want scalar g-force derived from x/y/z accelerometer data as a last resort, so that files containing only raw axes still provide a zero-at-rest scalar estimate.
24. As an OVRLEY user, I want lateral, longitudinal/inline, and vertical acceleration mapped consistently to canonical x, y, and z streams, so that semantic axis columns are retained.
25. As an OVRLEY user, I want explicit source X/Y/Z axes preserved without sign changes or rotation, so that the importer does not invent an orientation transformation.
26. As an OVRLEY user, I want gear position retained as a distinct vehicle metric, so that it is available for later widget support.
27. As an OVRLEY user, I want RPM retained as RPM rather than cadence, so that vehicle engine speed is not disguised as an activity-sport metric.
28. As an OVRLEY user, I want throttle and brake percentages retained, so that driver-control overlays can be implemented later without reparsing the CSV.
29. As an OVRLEY user, I want binary throttle or brake state converted to 0% or 100%, so that on/off sources fit the canonical control-position contract.
30. As an OVRLEY user, I want brake pressure ignored rather than treated as brake position, so that physically different metrics are not aliased.
31. As an OVRLEY user, I want negative lean angles preserved, so that left/right lean direction is not lost through circular normalization.
32. As an OVRLEY user, I want malformed or non-finite metric observations to become missing samples, so that one bad sensor cell does not reject an otherwise usable activity.
33. As an OVRLEY user, I want invalid bounded observations to become missing rather than be clamped, so that the importer does not manufacture plausible-looking values.
34. As an OVRLEY user, I want every accepted record to have real source timing, so that metrics are never aligned using invented sample spacing.
35. As an OVRLEY user, I want elapsed time rebased to zero, so that a CSV exported from the middle of a session starts at the beginning of the OVRLEY activity timeline.
36. As an OVRLEY user, I want explicit UTC or Unix time preserved as absolute timestamps, so that activity-to-video autosync can use authoritative recording time.
37. As an OVRLEY user, I want timezone-less recording dates interpreted using my computer's historical local timezone, so that AiM and older RaceChrono files have a reasonable opportunity to autosync.
38. As an OVRLEY user, I want elapsed-only files to remain importable without fabricated absolute timestamps, so that lack of wall-clock time does not invalidate a valid activity timeline.
39. As an OVRLEY user, I want decreasing time to reject the import with useful row context, so that source order corruption is not silently repaired.
40. As an OVRLEY user, I want adjacent equal-time records coalesced, so that legitimate duplicate exporter records do not make an in-scope file unusable.
41. As an OVRLEY user, I want the latest non-missing metric value retained when equal-time records are coalesced, so that the combined sample preserves available observations deterministically.
42. As an OVRLEY user, I want a clear error when no usable telemetry header or timed activity can be built, so that import does not appear successful with meaningless output.
43. As an OVRLEY user, I want all seven supplied CSV fixtures covered by integration tests, so that the supported exporter examples remain working as the parser evolves.
44. As an OVRLEY user, I want existing GPX, FIT, SRT, and IGC import behavior unchanged, so that adding CSV support does not regress established formats.
45. As a future OVRLEY developer, I want unsupported-in-UI motorsport metrics retained explicitly in `ParsedActivity`, so that future renderer and widget work does not require revisiting CSV extraction.
46. As a future OVRLEY developer, I want header, unit, source-priority, and column-building behavior encapsulated behind a small Rust interface, so that parser behavior can be tested without Tauri or React.

## Implementation Decisions

- CSV is parsed in Rust with the established `csv` crate. OVRLEY does not implement its own CSV tokenizer, quoting, or escaping rules.
- CSV import is comma-delimited only. Delimiter sniffing and semicolon/tab formats are not included.
- The frontend passes the native selected path to a dedicated backend command. It does not first read the CSV into a JavaScript `File`.
- Existing frontend parsers and the `RawActivity` IPC flow remain unchanged for non-CSV activity formats.
- The native command is a thin shell that delegates CSV-domain behavior to the Rust core and returns the finalized activity response.
- The CSV core exposes a reader-oriented entry point for isolated tests and a path-oriented entry point for production and fixture integration.
- The CSV subsystem is organized into deep ownership areas: public extraction/finalization orchestration, header/unit/source resolution, canonical unit conversion, and aligned column construction. The public interface remains small even if those areas use several internal modules.
- CSV extraction constructs `ActivityColumns` directly and invokes the existing shared columnar finalizer. It never creates or serializes row-oriented `RawActivity` for CSV.
- The finalized schema gains explicit numeric series for `g_force_x`, `g_force_y`, `g_force_z`, `rpm`, `throttle_position`, `brake_position`, and `lean_angle`.
- The new series participate in column-length validation, direct metric collection, metric units, coverage, extended-attribute availability, and final `ParsedActivity` assembly.
- The new fields are not added to trimming, dense rendering reports, render-data requirements, the standard metric manifest, widgets, or frontend formatting in this pass.
- Parser behavior is capability-based. It does not require recognizing an exporter or version dialect.
- A telemetry header requires at least one recognized timing basis and at least one recognized in-scope telemetry metric.
- Header matching normalizes only superficial syntax and then uses an explicit exact-alias registry. Substring and fuzzy matching are prohibited.
- The initial registry is seeded from all supplied fixture headers, including timing, coordinates, speed, distance, height, heading, acceleration, RPM, controls, lean, and gear aliases.
- Source qualifiers and unit annotations are parsed independently from the semantic header alias.
- A separate units row is accepted only when its non-empty cells are recognized units compatible with the selected header columns. Short nonnumeric strings alone are insufficient evidence.
- Explicit compatible units win over defaults. Unsupported or conflicting declared units cause that candidate column to be ignored while other candidates remain eligible.
- Missing-unit defaults are seconds for time, decimal degrees for coordinates, km/h for speed, metres for distance and height, degrees for heading and lean, g for acceleration, RPM for engine speed, and percentages for control positions subject to binary inference.
- Exactly one source column is selected per canonical metric. Selection follows a metric-specific priority registry and then uses the first matching candidate with at least one valid observation.
- GPS/direct device speed is preferred over calculated speed, which is preferred over OBD/vehicle speed.
- Direct logger, CAN, or OBD sources are preferred for RPM, throttle, brake, and gear. Accelerator-pedal position is preferred over generic throttle-body position.
- Equivalent same-priority columns expressed in different supported units need no further quality scoring because they normalize to the same canonical unit.
- Every accepted record must have valid elapsed time or a valid absolute timestamp from which elapsed time can be derived. Missing both fails the import with row context.
- The finalized activity requires at least two timed samples.
- Bare `Time` and `Timestamp` are elapsed seconds. Explicit elapsed time remains elapsed. Explicit UTC time is Unix time. When `Time (s)` and `Elapsed time (s)` coexist, elapsed time drives the timeline and `Time (s)` supplies the absolute timestamp.
- Elapsed time is rebased so the first accepted sample is zero.
- Explicit Unix/UTC timestamps are authoritative. Timezone-less date/time preambles may be consumed transiently and interpreted using the importing computer's timezone for that historical date. Invalid or DST-ambiguous local times do not receive another guessed timestamp.
- General preamble metadata is ignored and not copied into finalized activity metadata.
- Decreasing canonical time fails. Adjacent equal-time records are coalesced, with the last non-missing value winning for each selected metric. No coalesced-row count is stored.
- Blank, known absence markers, nonnumeric cells, non-finite values, and malformed metric observations become `None`. They do not fail import.
- Invalid bounded metric values become `None` rather than being clamped. Timing retains its stricter structural behavior.
- All source-unit conversion happens once in the CSV adapter. Consumers and the shared finalizer contain no CSV unit logic.
- Cumulative source distance is rebased to zero. When direct distance is unavailable, the existing finalizer derives it from coordinates; the CSV adapter does not duplicate haversine derivation.
- GPS/device/bare height populates elevation. Only explicit pressure/barometric altitude populates altitude. One source is not duplicated into both fields.
- Heading is normalized modulo 360. Lean angle remains signed.
- Semantic acceleration maps lateral to x, longitudinal/inline to y, and vertical to z. Literal X/Y/Z fields preserve their source sign without rotation.
- Direct scalar or combined acceleration wins. When absent, scalar g-force is derived first from lateral/longitudinal magnitude and finally from gravity-compensated x/y/z magnitude. Derived scalar g-force is zero at rest.
- Throttle and brake become canonical percentages. Position/pedal headers are percentages; state/braking headers are binary; an otherwise ambiguous unitless column containing only zero and one is inferred as binary for the whole column.
- Brake pressure is not a brake-position alias and remains out of scope.
- Import errors include the selected file and relevant record/header/timing context. Existing frontend error presentation remains responsible for displaying the failure.

## Testing Decisions

- Tests assert externally observable parsing and finalized activity behavior rather than private helper structure. Internal module boundaries may change without rewriting behavior tests.
- Header-resolution tests cover preamble skipping, header discovery, normalized exact aliases, false-positive avoidance, separate units rows, source qualifiers, supported units, missing-unit defaults, and unsupported/conflicting units.
- Unit-normalization tests cover all supported speed, distance, height, and time conversions plus heading normalization and binary control conversion.
- Column-construction tests cover metric source priority, malformed metric cells becoming missing, bounded-value rejection, timeline requirements, elapsed and distance rebasing, equal-time coalescing, and decreasing-time failures.
- Acceleration tests cover semantic axis mapping, literal axis preservation, direct scalar priority, lateral/longitudinal scalar derivation, and gravity-compensated x/y/z fallback derivation.
- Timestamp tests cover explicit Unix/UTC sources, paired elapsed/absolute columns, timezone-less assumed-local construction, and elapsed-only files without absolute timestamps.
- Rust integration tests parse every supplied CSV fixture through the reader/path extraction seam and the existing shared finalizer.
- Fixture tests assert a strictly increasing zero-based timeline, aligned series lengths, canonical units, finite-or-missing numeric samples, direct or GPS-derived distance, and retention of newly added motorsport fields when their source data exists.
- Targeted fixture assertions cover TrackAddict UTC and brake behavior; AiM's units row, GPS speed, distance, axes, gear, RPM, and throttle; Lap Legend controls, RPM, distance, elevation, and XYZ acceleration; RaceBox shorthand and raw axes; RaceChrono source priorities, timestamps, lean, combined acceleration, vehicle metrics, and duplicate-time coalescing.
- Tauri/frontend integration tests prove that native CSV paths are routed to the new backend command without a frontend byte read, successful results use the existing activity activation path, and backend errors reach the existing import-error UI.
- Regression tests prove that GPX, FIT, SRT, and IGC routing is unchanged.
- Existing Rust activity-finalizer integration tests are the prior art for canonical activity assertions. Existing frontend activity-import boundary tests are the prior art for command routing and store activation behavior.
- No production build is required to verify this feature. Rust tests and focused frontend Vitest tests are the expected implementation verification commands; builds remain subject to explicit user permission.

## Out of Scope

- Exporter- or version-specific dialect dispatch.
- Semicolon, tab, or auto-detected delimiters.
- General preservation of CSV preamble metadata.
- Lap timing, lap-relative time, sector timing, and trap events.
- Brake pressure and other pressure channels.
- Coolant, oil, intake, manifold, ambient, tire, and other specialized temperatures or pressures.
- Steering, clutch, AFR/lambda, fuel, electrical, gyro, magnetometer, GPS-quality, sampling-rate, and generic unnamed channels.
- Mapping RPM to cadence or collapsing other vehicle metrics into unrelated existing activity fields.
- Repairing decreasing timelines, inventing missing record times, or stitching cumulative-distance lap resets.
- Adding the new motorsport metrics to renderer trim/densification, render requirements, manifests, widgets, formatting, or editors.
- Changing existing GPX, FIT, SRT, IGC, or MP4 extraction behavior.
- Running a production build as part of implementation without explicit permission.

## Further Notes

- The supplied CSV fixtures are the acceptance corpus for the first implementation. The parser may recognize additional headers through the same explicit capability registry, but unknown metrics do not automatically enter the canonical model.
- Missing activity observations intentionally use Rust `None` and serialize as JSON `null` after finalization.
- Equal-time coalescing is required because one supplied RaceChrono v2 fixture contains legitimate adjacent duplicate timestamps, including a small number of rows whose non-timing values differ.
- The local-time timestamp fallback gives autosync a chance for timezone-less exports but is intentionally non-authoritative. Files recorded in a different timezone from the importing computer may not autosync correctly.
- The detailed engineering specification remains the source for fixture-level aliases, formulas, and acceptance examples. This PRD captures the product behavior and implementation decisions required for agent-ready delivery.

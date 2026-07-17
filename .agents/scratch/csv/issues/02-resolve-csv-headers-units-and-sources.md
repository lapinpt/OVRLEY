# Resolve CSV headers, units, and metric sources across exporters

Status: ready-for-human
Type: AFK

## Specification

Understand the full feature spec and the design decisions:

- scratch/csv/spec_codex.md
- scratch/csv/PRD.md

## What to build

Extend the working CSV import path with the capability-based header, units, alias, and source-priority resolver required by TrackAddict, AiM, and Lap Legend. The parser must find telemetry after variable preambles, recognize an optional compatible units row, normalize explicit and default units, ignore unknown columns, and select exactly one source for each existing canonical metric.

This slice keeps exporter identity out of dispatch logic. It expands the same end-to-end import operation established by the first slice, so each newly covered fixture can be selected in the UI and finalized normally.

## User stories covered

3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 18, 19, 20

## Acceptance criteria

- [x] Header discovery requires a recognized timing basis and at least one in-scope telemetry metric, without relying on exporter/version markers.
- [x] Header matching normalizes superficial syntax and uses an explicit exact-alias registry; substring and fuzzy matching are not used.
- [x] AiM's separate units row is recognized only through unit compatibility with selected headers and is not confused with a data row.
- [x] Explicit supported units, missing-unit defaults, and the agreed speed/distance/height conversions produce canonical units.
- [x] A column with an unsupported or conflicting declared unit is ignored while other candidates remain eligible.
- [x] GPS/direct speed wins over calculated speed, which wins over OBD/vehicle speed.
- [x] `Distance on GPS Speed` resolves as distance rather than speed.
- [x] TrackAddict, AiM, Lap Legend, and RaceBox import end-to-end for all recognized existing canonical metrics.
- [x] Unit and integration tests cover preambles, units rows, aliases, false-positive avoidance, source priority, and conversions.

## Blocked by

- `01-import-racebox-csv-end-to-end.md`

## Comments

### 2026-07-17 — Implementation complete

- Added capability-based header discovery, exact aliases, independently parsed source qualifiers, dimensional units-row recognition, canonical conversions, metric-specific source priority, and cumulative-distance rebasing.
- TrackAddict comments/preambles, AiM's compatible units row, Lap Legend's qualified channels, and RaceBox defaults import through the existing native reader/path interfaces and shared finalizer.
- Focused verification passed: 11 CSV integration tests, targeted Rust formatting, `cargo check` for `ovrley_core`, and `git diff --check`.
- Final Standards and Spec reviews passed with no remaining findings.
- Equal-time coalescing remains in ticket 03; this slice accepts TrackAddict's non-decreasing equal-time source rows without implementing that later behavior.
- No production build or full test suite was run.

# Resolve CSV headers, units, and metric sources across exporters

Status: ready-for-agent  
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

- [ ] Header discovery requires a recognized timing basis and at least one in-scope telemetry metric, without relying on exporter/version markers.
- [ ] Header matching normalizes superficial syntax and uses an explicit exact-alias registry; substring and fuzzy matching are not used.
- [ ] AiM's separate units row is recognized only through unit compatibility with selected headers and is not confused with a data row.
- [ ] Explicit supported units, missing-unit defaults, and the agreed speed/distance/height conversions produce canonical units.
- [ ] A column with an unsupported or conflicting declared unit is ignored while other candidates remain eligible.
- [ ] GPS/direct speed wins over calculated speed, which wins over OBD/vehicle speed.
- [ ] `Distance on GPS Speed` resolves as distance rather than speed.
- [ ] TrackAddict, AiM, Lap Legend, and RaceBox import end-to-end for all recognized existing canonical metrics.
- [ ] Unit and integration tests cover preambles, units rows, aliases, false-positive avoidance, source priority, and conversions.

## Blocked by

- `01-import-racebox-csv-end-to-end.md`

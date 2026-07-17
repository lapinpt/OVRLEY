# Import a RaceBox CSV through the native columnar activity path

Status: ready-for-human
Type: AFK

## Specification

Understand the full feature spec and the design decisions:

- scratch/csv/spec_codex.md
- scratch/csv/PRD.md

## What to build

Deliver the first complete CSV import path using the RaceBox fixture as the tracer bullet. A user can select a CSV from the existing activity control; the frontend passes the native selected path to Rust; Rust reads it with the `csv` crate, constructs canonical activity columns for elapsed time, coordinates, speed, and elevation, finalizes them through the shared columnar workflow, and activates the resulting activity normally.

This slice establishes the small public Rust extraction interface and thin native command without introducing a `RawActivity` JSON round trip. Existing non-CSV formats continue through their current frontend parsers.

## User stories covered

1, 2, 14, 15, 18, 34, 35, 42, 44, 46

## Acceptance criteria

- [x] The activity picker accepts CSV files and routes a native CSV path to a dedicated backend operation without first loading the file into a JavaScript `File`.
- [x] Rust uses the `csv` crate and a reader-oriented core interface to parse the RaceBox fixture.
- [x] The parser builds `ActivityColumns` directly and invokes the existing shared columnar finalizer; CSV never crosses IPC as `RawActivity` JSON.
- [x] RaceBox elapsed time is zero-based and strictly increasing after finalization.
- [x] RaceBox latitude, longitude, speed, and elevation are present in canonical units.
- [x] The finalized activity activates through the existing frontend store and scene-timing workflow.
- [x] Focused Rust and frontend boundary tests verify the complete path and prove existing GPX/FIT/SRT/IGC routing is unchanged.
- [x] No production build is run.

## Blocked by

None - can start immediately

## Comments

### 2026-07-17 — Implementation complete

- Native CSV selection routes the original path through `backend_parse_csv_activity`; non-CSV formats retain their existing browser-parser and `RawActivity` finalization path.
- RaceBox CSV parsing uses the Rust `csv` crate through public reader/path entry points, constructs `ActivityColumns`, and calls `finalize_activity_columns()`.
- Focused verification passed: 3 Rust CSV tests, 8 frontend boundary tests, targeted ESLint, Rust formatting checks, Tauri `cargo check`, and `git diff --check`.
- Standards and specification re-reviews passed with no remaining findings.
- No production build or full test suite was run.

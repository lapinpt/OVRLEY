# Import a RaceBox CSV through the native columnar activity path

Status: ready-for-agent  
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

- [ ] The activity picker accepts CSV files and routes a native CSV path to a dedicated backend operation without first loading the file into a JavaScript `File`.
- [ ] Rust uses the `csv` crate and a reader-oriented core interface to parse the RaceBox fixture.
- [ ] The parser builds `ActivityColumns` directly and invokes the existing shared columnar finalizer; CSV never crosses IPC as `RawActivity` JSON.
- [ ] RaceBox elapsed time is zero-based and strictly increasing after finalization.
- [ ] RaceBox latitude, longitude, speed, and elevation are present in canonical units.
- [ ] The finalized activity activates through the existing frontend store and scene-timing workflow.
- [ ] Focused Rust and frontend boundary tests verify the complete path and prove existing GPX/FIT/SRT/IGC routing is unchanged.
- [ ] No production build is run.

## Blocked by

None - can start immediately

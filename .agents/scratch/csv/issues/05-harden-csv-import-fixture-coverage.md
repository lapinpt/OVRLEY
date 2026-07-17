# Harden CSV import across the complete fixture corpus

Status: ready-for-human
Type: AFK

## Specification

Understand the full feature spec and the design decisions:

- scratch/csv/spec_codex.md
- scratch/csv/PRD.md

## What to build

Complete and harden the CSV feature against the full seven-file acceptance corpus. Close gaps in aliases and source priorities without introducing exporter dispatch, verify permissive missing-observation behavior and strict timing failures, improve actionable error context, and add regression coverage around the complete native/frontend import path.

This slice turns the accumulated tracer bullets into a release-ready CSV import feature while preserving the established behavior of every non-CSV activity source.

## User stories covered

3, 4, 32, 33, 42, 43, 44, 46 and final acceptance of all preceding stories

## Acceptance criteria

- [x] All seven supplied CSV fixtures import through the native path and shared columnar finalizer.
- [x] Every fixture produces aligned series, a strictly increasing zero-based timeline, canonical units, and finite-or-missing metric values.
- [x] Every recognized required metric is present for fixtures that supply a usable source, including the newly retained motorsport series.
- [x] Blank, known absence markers, nonnumeric cells, non-finite values, and invalid bounded metric observations become missing values without failing import.
- [x] Unknown metrics and general preamble data remain ignored.
- [x] Structural failures report the selected file plus relevant header, record, or timing context through the existing frontend error path.
- [x] Tests cover unsupported/conflicting units, missing timing, decreasing time, ambiguous/unusable headers, equal-time records, and bounded-value behavior.
- [x] Frontend tests prove CSV uses native path routing and successful import activates through the existing store workflow.
- [x] Regression tests prove GPX, FIT, SRT, IGC, and MP4 extraction behavior remains unchanged.
- [x] Focused Rust and frontend test suites pass; no production build is run.

## Blocked by

- `04-retain-motorsport-csv-metrics.md`

## Comments

- Implemented final fixture-corpus hardening, contextual CSV errors, command serialization coverage, frontend error-path coverage, and exact RaceChrono-family source assertions.
- Verified `cargo test --test csv_activity` (26 passed), focused MP4 columnar regression (1 passed), focused frontend import tests (9 passed), `cargo check`, and focused ESLint.
- The pre-existing real-video MP4 integration test compiled but could not run because `tests/fixtures/video` is absent in this checkout; fixture-independent MP4 finalizer coverage passed.
- No production build or full test suite was run.

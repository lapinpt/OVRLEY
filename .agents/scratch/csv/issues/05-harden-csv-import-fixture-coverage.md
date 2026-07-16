# Harden CSV import across the complete fixture corpus

Status: ready-for-agent  
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

- [ ] All seven supplied CSV fixtures import through the native path and shared columnar finalizer.
- [ ] Every fixture produces aligned series, a strictly increasing zero-based timeline, canonical units, and finite-or-missing metric values.
- [ ] Every recognized required metric is present for fixtures that supply a usable source, including the newly retained motorsport series.
- [ ] Blank, known absence markers, nonnumeric cells, non-finite values, and invalid bounded metric observations become missing values without failing import.
- [ ] Unknown metrics and general preamble data remain ignored.
- [ ] Structural failures report the selected file plus relevant header, record, or timing context through the existing frontend error path.
- [ ] Tests cover unsupported/conflicting units, missing timing, decreasing time, ambiguous/unusable headers, equal-time records, and bounded-value behavior.
- [ ] Frontend tests prove CSV uses native path routing and successful import activates through the existing store workflow.
- [ ] Regression tests prove GPX, FIT, SRT, IGC, and MP4 extraction behavior remains unchanged.
- [ ] Focused Rust and frontend test suites pass; no production build is run.

## Blocked by

- `04-retain-motorsport-csv-metrics.md`

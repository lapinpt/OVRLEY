# Normalize CSV timing, timestamps, duplicates, and distance

Status: ready-for-agent  
Type: AFK

## Specification

Understand the full feature spec and the design decisions:

- scratch/csv/spec_codex.md
- scratch/csv/PRD.md

## What to build

Extend CSV import to cover the RaceChrono timing shapes and complete the structural activity contract. Support explicit elapsed time, authoritative UTC/Unix timestamps, paired absolute and elapsed columns, and the agreed assumed-local timestamp fallback from transient date preambles. Rebase elapsed time and cumulative distance, coalesce adjacent equal-time records, and reject records that cannot be placed on a real source timeline.

This slice makes both RaceChrono v1 and v2 usable through the same frontend-to-finalizer path and delegates GPS-derived distance to the existing shared finalizer when no direct distance source is available.

## User stories covered

16, 17, 34, 35, 36, 37, 38, 39, 40, 41, 42

## Acceptance criteria

- [ ] Bare `Time`/`Timestamp`, explicit elapsed time, explicit UTC time, and paired `Time (s)` plus `Elapsed time (s)` follow the agreed semantic mapping without numeric-magnitude guessing.
- [ ] Elapsed time is rebased so the first accepted sample is zero.
- [ ] Explicit UTC/Unix timestamps become canonical absolute timestamps.
- [ ] Supported timezone-less preamble dates are interpreted using the importing computer's historical local timezone; invalid or DST-ambiguous local times remain without absolute timestamps.
- [ ] General preamble metadata is not retained in the finalized activity.
- [ ] A record lacking both usable elapsed time and a usable absolute timestamp fails the import with row context.
- [ ] Decreasing canonical time fails, while adjacent equal-time records coalesce using the last non-missing value for each metric.
- [ ] The coalesced-row count is not recorded in metadata, and the resulting activity timeline is strictly increasing.
- [ ] Direct cumulative distance is converted to metres and rebased to zero; absent direct distance uses the finalizer's existing coordinate-derived path.
- [ ] RaceChrono v1 and v2 fixtures import end-to-end, including the duplicate timestamps in the v2 session fixture.
- [ ] Focused tests cover every timing form, local-time behavior, failures, rebasing, and coalescing.

## Blocked by

- `02-resolve-csv-headers-units-and-sources.md`

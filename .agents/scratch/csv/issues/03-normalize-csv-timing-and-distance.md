# Normalize CSV timing, timestamps, duplicates, and distance

Status: ready-for-human
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

- [x] Bare `Time`/`Timestamp`, explicit elapsed time, explicit UTC time, and paired `Time (s)` plus `Elapsed time (s)` follow the agreed semantic mapping without numeric-magnitude guessing.
- [x] Elapsed time is rebased so the first accepted sample is zero.
- [x] Explicit UTC/Unix timestamps become canonical absolute timestamps.
- [x] Supported timezone-less preamble dates are interpreted using the importing computer's historical local timezone; invalid or DST-ambiguous local times remain without absolute timestamps.
- [x] General preamble metadata is not retained in the finalized activity.
- [x] A record lacking both usable elapsed time and a usable absolute timestamp fails the import with row context.
- [x] Decreasing canonical time fails, while adjacent equal-time records coalesce using the last non-missing value for each metric.
- [x] The coalesced-row count is not recorded in metadata, and the resulting activity timeline is strictly increasing.
- [x] Direct cumulative distance is converted to metres and rebased to zero; absent direct distance uses the finalizer's existing coordinate-derived path.
- [x] RaceChrono v1 and v2 fixtures import end-to-end, including the duplicate timestamps in the v2 session fixture.
- [x] Focused tests cover every timing form, local-time behavior, failures, rebasing, and coalescing.

## Blocked by

- `02-resolve-csv-headers-units-and-sources.md`

## Comments

### 2026-07-17 — Implementation complete

- Added semantic timing selection for bare elapsed values, explicit elapsed channels, UTC/Unix time, explicit-offset RFC timestamps, paired RaceChrono absolute/elapsed columns, and mixed rows anchored by a real dual-timed sample.
- Added transient AiM and RaceChrono v1 local preamble handling using the importing computer's historical timezone. AiM elapsed time advances from one resolved instant across DST; invalid and ambiguous wall times remain without absolute timestamps.
- Added strict row-context failures, decreasing-time rejection, equal-time coalescing with last-non-missing values, zero-based elapsed/distance rebasing, and explicit omission of CSV coalescing information from finalized metadata.
- RaceChrono v1, RaceChrono v2, and the supplied RaceChrono sample import through the native path and shared finalizer; v2 duplicates coalesce to a strictly increasing timeline.
- Focused verification passed: 20 CSV integration tests, the existing raw-finalizer metadata regression test, `cargo check` for `ovrley_core`, scoped rustfmt checks, and `git diff --check`.
- Final two-axis review: Spec passed with no findings; Standards passed with no hard violations and one non-blocking Data Clumps refactor suggestion for the timing vectors.
- No production build or full test suite was run.

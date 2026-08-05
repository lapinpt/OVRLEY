---
Status: ready-for-agent
---

# Lap Timer Widgets

## Problem Statement

Users who record circuit/racing activities (CSV/VBO) need to display live lap timing on their video overlays: current lap time, best lap time so far, live delta to the best lap, and a log of completed lap times. The existing overlay system only supports telemetry-based value widgets (speed, heart rate, etc.) and does not have a concept of laps or lap-relative timing. We need to add a lap-aware widget family that integrates with the existing renderer, editor, and preview pipeline without forking the data model.

## Solution

Introduce a single new metric/display type `lap_timer` with four per-widget modes. The widget draws text-only overlays (no background) and reuses the existing scene-level font, color, shadow, and border defaults. Lap boundary data is derived by the existing CSV/VBO parser/finalizer pipeline and exposed as new aligned series on `ParsedActivity`; the renderer consumes these series and, for quasi-static modes, caches rendered pixels so they are only redrawn when a lap completes.

## User Stories

1. As a track-day rider, I want to add a "Current Lap" widget to my overlay, so that I can see my live lap time counting up during each lap.
2. As a track-day rider, I want the current lap widget to show `--:--.--` before the first lap starts, so that I know the overlay is waiting for the start/finish line.
3. As a track-day rider, I want a "Best Lap" widget, so that I can see the fastest completed lap so far as static text.
4. As a track-day rider, I want the best-lap widget to fall back to my live current lap time when no lap has completed yet, so that the screen is never empty at the start of a session.
5. As a track-day rider, I want a "Delta" widget, so that I can see whether I am currently faster or slower than my best lap time so far.
6. As a track-day rider, I want the delta widget to always show a `+` or `-` sign, so that the sign is unambiguous at a glance.
7. As a track-day rider, I want to configure the positive and negative delta colors independently, so that I can match my preferred color scheme.
8. As a track-day rider, I want a "Lap Time Log" widget, so that I can review all completed lap times and their deltas during the session.
9. As a track-day rider, I want the lap log to show the current in-progress lap at the bottom, so that the table is live and not just historical.
10. As a track-day rider, I want the lap log columns to be right-aligned, so that lap times like `9:59.99` and `10:02.05` line up visually.
11. As a track-day rider, I want the lap log header to be drawn at reduced opacity, so that the header does not compete with the lap data.
12. As a track-day rider, I want to turn the label on or off for each lap timer widget, so that I can fit more widgets on screen.
13. As a track-day rider, I want per-mode default labels (`Current Lap`, `Best Lap`, `Delta`, `Lap Times`), so that I do not have to type them manually.
14. As a track-day rider, I want to customize the label text, so that I can use my own language or abbreviations.
15. As a track-day rider, I want lap timer widgets to use the same global font/color/opacity/shadow/border defaults as other text widgets, so that my overlay stays consistent.
16. As a track-day rider, I want the lap timer catalog entry to present the four readouts as options when I add it, so that I can pick the right one without hunting through the editor.
17. As a track-day rider, I want the preview in the editor to match the final video output, so that I can verify layout and timing before rendering.
18. As a track-day rider, I want the renderer to avoid redrawing the best-lap value and completed log rows every single frame, so that export performance stays high.
19. As a track-day rider, I want out-laps (before the first start/finish crossing) to be handled gracefully, so that the overlay does not show garbage data.
20. As a track-day rider, I want partial laps that are cut by the scene trim to be excluded from "best lap" and the log, so that the overlay only reflects the laps I actually exported.
21. As a track-day rider, I want the current lap time to count from the actual lap start time, not from the video trim start, so that the timing is accurate even when I export only a portion of the session.

## Implementation Decisions

- **Taxonomy:** One new standard metric type `lap_timer` and one new display type `lap_timer`. The four readouts are selected by a per-widget field `lap_timer_mode` with values `current_lap`, `best_lap`, `delta`, and `lap_log`. The metric type only supports the `lap_timer` display type.

- **Activity data contract:** The CSV/VBO parser/finalizer pipeline (per the existing lap-timing strategy document) derives three new aligned series on `ParsedActivity`:
  ```
  lap_number: Vec<i64>               // 0-based for completed laps, -1 for out-lap
  lap_time_seconds: Vec<Option<f64>> // null during out-lap
  delta_to_best_lap_seconds: Vec<Option<f64>> // null before reference exists
  ```
  It also emits compact per-lap metadata arrays (length = number of completed laps in the session, not per-sample):
  ```
  lap_durations_seconds: Vec<f64>              // duration of each completed lap
  lap_durations_best_so_far_seconds: Vec<f64>  // prefix-min of lap_durations_seconds
  ```
  and a scalar `best_lap_time_seconds: Option<f64>`. The aligned series propagate through `TrimmedActivity` and `DenseActivityReport` and are gated by new boolean flags in `RenderDataRequirements`; the per-lap metadata is scoped to the active trim window so partial out/in-laps are excluded.

- **Widget data shape:** The widget is a flat value widget with no `display_variants`. Configurable fields are `x`, `y`, `font`, `font_size`, `color`, `opacity`, `show_label`, `label`, `positive_delta_color`, and `negative_delta_color`, plus `lap_timer_mode`. Global defaults seed `font`, `font_size`, `color`, and `opacity` on creation.

- **Display defaults:**
  - `current_lap` label default: `"Current Lap"`
  - `best_lap` label default: `"Best Lap"`
  - `delta` label default: `"Delta"`
  - `lap_log` label default: `"Lap Times"`

- **Rendering mode:** The widgets are intrinsic text widgets (not boxed). The widget's `(x, y)` is the top-left origin. If `show_label` is true, the label is drawn above the value at a smaller font size (~35% of `font_size`). Scene-level shadow and border are applied to the drawn text exactly like other text widgets.

- **Time formatting:** Lap durations and best-lap values are formatted as `MM:SS.ss` for laps under an hour, extending to `HH:MM:SS.ss` when necessary. Delta values are signed with two decimals (e.g., `+0.12`, `-0.34`) and zero renders as `+0.00`.

- **Delta color:** Delta values use `positive_delta_color` when the value is greater than or equal to zero and `negative_delta_color` when negative. The label text always uses the main `color`.

- **Lap log table:** The log shows a header row (`LAP`, `TIME`, `DELTA`) at 70% opacity of the main `color`, followed by one row per completed lap and a final live row for the in-progress lap. All numeric columns are right-aligned. The in-progress row updates every frame; completed rows are static between lap boundaries.

- **Best-lap logic:** The renderer uses the precomputed `lap_durations_best_so_far_seconds` array. For a frame whose current internal `lap_number` is `N`, the best completed lap so far is `lap_durations_best_so_far_seconds[N - 1]` when `N > 0`; otherwise there is no completed best lap yet. A lap is considered completed only if its end boundary falls within the trimmed scene, so the per-lap metadata is already scoped to the active trim window. The current lap is never included in the best-lap reference.

- **Empty states:**
  - `current_lap`: `--:--.--` during out-lap; live time otherwise.
  - `best_lap`: `--:--.--` during out-lap; live current-lap time when a current lap is in progress but no lap has completed; best completed-lap time otherwise.
  - `delta`: `+0.00` when no reference exists.
  - `lap_log`: header only during out-lap; header + in-progress row during the first lap; header + completed rows + in-progress row after the first completion.

- **Caching strategy:** Quasi-static content is cached so it is only redrawn on a lap boundary. A new `LapTimer` variant is added to the existing `PresentationCache` / `PreparedRenderAssets` mechanism. At preparation time, the cache builds a compact lookup table from the precomputed `lap_durations_seconds` and `lap_durations_best_so_far_seconds` metadata. The cache key per widget is based on the current lap state (e.g., `current_lap_number` and `completed_lap_count`).
  - `best_lap`: caches the full label + value when at least one lap is completed; invalidated when a new lap completes.
  - `lap_log`: caches the header + all completed rows; invalidated when a new lap completes; the in-progress row is drawn dynamically on top.
  - `current_lap` and `delta`: drawn fresh every frame.

- **Catalog/editor integration:** The widget drawer shows a single "Lap Timer" entry. Clicking it presents a submenu with the four readouts, each creating a widget with `value: "lap_timer"`, `display_type: "lap_timer"`, and the corresponding `lap_timer_mode`. The editor panel shows a mode dropdown plus the configurable fields above, reusing the existing position and opacity sections.

- **Preview parity:** The frontend preview model consumes the same compact per-lap metadata (`lap_durations_seconds`, `lap_durations_best_so_far_seconds`) that the renderer uses, so the editor preview matches the rendered output without re-deriving the best-so-far values.

## Testing Decisions

- **Highest seam:** End-to-end render preview tests. A synthetic `ParsedActivity` with known lap data and a `RenderConfig` containing one of each `lap_timer` mode is rendered at several frame indices; the resulting output is asserted to contain the expected text content (via a test helper that inspects the rendered image or a debug text-dump seam).

- **Lower seams (kept minimal):**
  - Integration tests on the existing CSV/VBO fixture pipeline asserting that the correct `lap_number`, `lap_time_seconds`, `delta_to_best_lap_seconds`, `lap_durations_seconds`, and `lap_durations_best_so_far_seconds` values are produced for each fixture.
  - Unit tests for the lap-state derivation algorithm with synthetic data, mirroring the existing test patterns for interpolation and trimming.

- **What makes a good test:** Tests should assert externally observable behavior (formatted text, pixel regions, or derived series values) rather than internal implementation details like the exact cache key structure. Good tests exercise the out-lap, first-lap, mid-lap, lap-completion, and post-completion states.

## Out of Scope

- Manual lap marking or user-defined start/finish geofences in the UI.
- Fixed-distance lap detection (e.g., every 1000 m).
- Automatic best-lap detection using GPS circuit matching for sources without explicit lap data.
- Separate display types for each readout; the UI submenu is a shim, and the durable data model stays as one `lap_timer` display type.
- Backgrounds, progress bars, or non-text visualizations for the lap timer.

## Further Notes

- The design intentionally keeps the data model as one `lap_timer` display type to avoid multiplying the display-type matrix. The drawer submenu is a UI-only convenience and does not affect the template schema.
- The `lap_timer` metric type is not a traditional telemetry source; it is a derived-time source. Its `MetricKind` variant is added to the canonical enum, and it only requests the lap timing series in `RenderDataRequirements`.
- The best-lap and lap-log caches are keyed by the current lap state, not by the formatted text string. This avoids stale pixels if the widget color/font changes, because those changes force a fresh `PreparedRenderAssets` build.
- The per-lap metadata arrays are intentionally compact (one entry per completed lap, not per sample) and are scoped to the active trim window so that partial out-laps and in-laps cut by the scene trim do not pollute the best-lap reference or the log.

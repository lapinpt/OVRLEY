---
Status: ready-for-agent
---

# G-Force Display Type Specification

## Problem Statement

Users of OVRLEY who record activities with IMU-equipped sources (AiM, TrackAddict, RaceChrono, RaceBox, Lap Legend, GoPro, DJI, CSV importers) cannot visually see the dynamic g-force vector their vehicle or body is producing. The `g_force` metric already exists in `standard-metrics.json` and the activity schema stores three-axis accelerometer components (`g_force_x`, `g_force_y`, `g_force_z`) plus a precomputed magnitude series, but only the plain `text` display type exposes any of it — and the text display says nothing about *direction*. There is no way for a user to see the lateral/longitudinal acceleration vector trace that every motorsport dashboard calls the G-G diagram, friction circle, or g-ball.

## Solution

Add a new **`g_force` display type** for the existing `g_force` metric in `assets/standard-metrics.json`. It renders as a boxed circular instrument: a parent circle (the G-G envelope) with a dot inside whose position encodes the dynamic acceleration vector over time, and a bottom-right text label showing the radial magnitude in G. The display type reads the activity's `g_force_x`/`g_force_y`/`g_force_z` series and lets the user pick which axis drives the horizontal and vertical screen directions, with per-axis invert. The display type is implemented identically by the Rust Skia renderer and the React/JSX SVG preview, with tests pinning behaviour on the one shared computation (auto-derived `max_g`).

## User Stories

### Actor: end user (cyclist / runner / motorsport driver / drone operator)

1. As a user, I want to add a `g_force` metric widget and switch its display type to the new G-Force gauge, so that I can see a circular instrument showing the dynamic g-force vector over my activity.
2. As a user, I want the dot inside the G-Force circle to move through the course of the video, so that I can see how hard I am cornering, braking, and accelerating at each moment.
3. As a user, I want the parent circle to represent a fixed maximum g value derived from my own recording, so that the dot's position relative to the edge geometrically means how close I am to my peak dynamic load.
4. As a user, I want the dot to clamp to the circle edge when my recording exceeds the derived maximum, so that the dot never leaves the instrument and the visual identity as a bounded gauge is preserved.
5. As a user, I want the bottom-right of the circle to show the radial magnitude as a number with a "G" suffix, so that I can read the exact g value when the geometric position is ambiguous (e.g. near the centre).
6. As a user, I want the dot to sit at the centre and the text to read "0.0 G" while I am stationary, so that the at-rest state is visually distinct from a missing-data state.
7. As a user, I want the dot to sit at the centre and the text to read "--" when my activity has no IMU data, so that "no data" is loud and unambiguous.
8. As a user, I want to pick which of the three accelerometer axes drives the horizontal direction of the dot, so that I can match the widget to how my recording device was mounted.
9. As a user, I want to pick which of the remaining two axes drives the vertical direction of the dot, so that I can cover any mount orientation without leaving the widget's vocabulary.
10. As a user, I want the axis I have already assigned to horizontal to be unavailable for the vertical slot (and vice versa), so that I am prevented from collapsing the plot to a degenerate diagonal by mistake.
11. As a user, I want to be able to invert each axis independently via a switch, so that I can flip the sign convention when my source uses an opposite polarity from the default.
12. As a user, I want the G-Force display type to share the same x/y/opacity/rotation layout controls as my other metric widgets, so that I can position it the same way as the rest of my overlay.
13. As a user, I want the widget frame to stay square as I resize it, so that the circular instrument never stretches into an ellipse.
14. As a user, I want to control the diameter of the parent circle, so that I can match the G-Force widget's overall footprint to my other widgets.
15. As a user, I want to control the parent circle's fill color and opacity, border thickness, and border color, so that the instrument matches my overlay's visual style.
16. As a user, I want to control the dot's size, color, and opacity, so that the marker reads clearly against the parent circle and the underlying video.
17. As a user, I want to control the text's font, font-size, and color, so that the magnitude label is legible at my chosen video resolution and matches my other widgets' typography.
18. As a user, I want to control the unit label's color, so that the "G" suffix is visually distinct (or matched) from the magnitude digits as I prefer.
19. As a user, I want to control the horizontal and vertical offset of the text+unit block, so that I can fine-tune its placement inside the bottom-right corner of the circle.
20. As a user, I want changes to the axis mapping and invert switches to update the preview immediately, so that I can iterate on my mount orientation without waiting for a backend re-render.
21. As a user, I want the preview I see in the editor to match the frames written into the final encoded video, so that I am not surprised by the rendered output.
22. As a user with a low-sample-rate source (1 Hz .fit), I want the dot to glide smoothly between samples at video frame rate, so that the dot doesn't teleport once per second.
23. As a user, I want the percentile-based auto-scaling to absorb rare sensor spikes (potholes, mount knocks) so that a single glitch doesn't shrink the dot to invisibility for the rest of the video.
24. As a user, I want the G-Force display type to be available in the display-type dropdown for the `g_force` metric, so that I can find it without learning a new UI mental model.
25. As a user with a source that only populates one or two axes, I want the widget to honestly show "no data" (`--`) when the user-selected axis pair has no data, rather than producing a degenerate or invented signal.

### Actor: agent / developer maintaining the codebase

26. As a developer, I want the G-Force widget's config schema to live under `displayTypes.definitions.g_force` in `assets/standard-metrics.json`, so that it is a display type of the existing `g_force` metric and not a new top-level widget family.
27. As a developer, I want the `g_force` metric override to be updated to `["text", "g_force"]`, so that the new display type is only available for the `g_force` metric.
28. As a developer, I want the widget to read only the canonical `g_force_x`/`g_force_y`/`g_force_z` activity series (no aliases, no remapping), so that the contract stays aligned with the codebase's "one canonical naming scheme" rule.
29. As a developer, I want the widget to own its own display config (diameter, fill, border, dot, axis mapping, text) inside the display-type defaults, so that the widget is self-contained and does not pull `decimals` or `formatter` from `standard-metrics.json` (a separate concern).
30. As a developer, I want the `max_g` derivation to compute once at widget-prepare time and ride on the cache, so that per-frame rendering remains O(1).
31. As a developer, I want the cache to rebuild on any widget config change or activity change, so that I never serve a stale scale, stale circle primitive, or stale axis-mapping-derived max_g.
32. As a developer, I want the static parent circle primitive to be cached and the dot+text to be drawn fresh per frame, so that the per-frame cost is minimal but no stale visual state is reused.
33. As a developer, I want the axis invert to be applied at the series-read stage (before interpolation and `max_g` calculation), so that downstream consumers see already-oriented data and both renderers apply the flip at the same pipeline point.
34. As a developer, I want `max_g` to be computed independently by both Rust and JSX, so that IPC cost is avoided on axis-mapping edits without divergence going unnoticed.
35. As a developer, I want the `clip_percentile` field to be present in `assets/standard-metrics.json` defaults (default `99`) and read by both render paths, so that percentile clipping is consistent and tunable without an editor change.
36. As a developer, I want the `clip_percentile` field to NOT be exposed in the editor for now, so that the editor surface stays minimal and a power user who wants to tune it edits the manifest directly.
37. As a developer, I want the unit string to be a hardcoded `"G"` with no conversion logic in either render path, so that the widget does not pretend to support `m/s²` (no per-axis m/s² series exists in the activity schema).
38. As a developer, I want missing data (absent series or per-sample nulls) to be handled identically in both render paths — dot at centre, text "--" — so that preview and exported frames never disagree on the no-data state.
39. As a developer, I want the G-Force display type to be dispatched by `display_type === 'g_force'` in both `WidgetPreview.jsx` and the editor, so that adding it is a one-line dispatcher extension rather than a new top-level widget family.
40. As a developer, I want the dot's position to clamp to the circle edge when its radius exceeds `max_g`, so that the render math stays simple (no overflow drawing) and the widget's bounded-instrument identity is preserved.
41. As a developer, I want zero-magnitude to render identically to any other small magnitude (dot at centre, text "0.0 G") and missing to render distinctly (dot at centre, text "--"), so that the two states are only disambiguated by the text per the existing convention.
42. As a developer, I want no reference markings (no concentric rings, no crosshair axes) shipped by default, so that the initial widget matches the explicit minimal spec (circle + dot + text) and the render paths stay small.
43. As a developer, I want the editor axis picker to use shadcn/ui minitabs `[X|Y|Z]` and shadcn/ui Switch components (not checkboxes) for the invert toggle, so that the editor matches the project's existing shadcn/ui conventions.
44. As a developer, I want an axis assigned to one slot to be visually greyed out and unselectable in the other slot, with a tooltip "Already used for Horizontal / Vertical", so that the exclusivity rule is visible rather than silently rejected.

## Implementation Decisions

### Manifest placement

- The new display type is added under `displayTypes.definitions.g_force` in `assets/standard-metrics.json`, alongside the existing `text`, `heading_tape`, `arc`, `linear`, and `corner` display types.
- The `g_force` metric override is updated to `["text", "g_force"]` so that the new display type is only available for the `g_force` metric.
- It does NOT introduce a new top-level widget family in `assets/standard-widgets.json`. The `g_force` metric remains the only entry point; the display type is selected via the display-type dropdown.

### Display type schema

```json
{
  "g_force": {
    "label": "G-Force",
    "icon": {
      "source": "shared",
      "assetFile": "display-type-g-force.svg"
    },
    "layoutMode": "boxed",
    "defaultFrameWidth": 220,
    "defaultFrameHeight": 220,
    "defaultFontSize": 14,
    "defaults": {
      "display_type": "g_force",
      "show_icon": false,
      "diameter": 200,
      "fill_color": "#212121",
      "fill_opacity": 0.5,
      "border_thickness": 2,
      "border_color": "#ffffff",
      "border_opacity": 1,
      "dot_size": 12,
      "dot_color": "#ffffff",
      "dot_opacity": 1,
      "axis_horizontal": "x",
      "axis_vertical": "y",
      "invert_horizontal": false,
      "invert_vertical": false,
      "clip_percentile": 99,
      "text_font": "Arial.ttf",
      "text_font_size": 14,
      "text_color": "#ffffff",
      "text_decimals": 1,
      "text_unit": "G",
      "text_unit_color": "#ffffff",
      "text_offset_x": 0,
      "text_offset_y": 0
    }
  }
}
```

- `width`, `height`, and `rotation` are frame keys from `variantFrameKeys`.
- `x`, `y`, `opacity`, and base `show_units`/`display_unit` are inherited from the standard `text` display-type defaults.
- `decimals` is display-type-owned (`text_decimals`) and not pulled from `standard-metrics.json`.
- `text_unit` is hardcoded to `"G"` in defaults and not exposed in the editor.

### Data semantics

- Dot `(h, v)` is the lateral+longitudinal 2D g-force vector (also known as the friction circle / G-G diagram). z is dropped.
- The radial magnitude `√(h² + v²)` is what the text label displays and what the dot's distance from centre encodes.
- `h` and `v` are read from the activity's `g_force_x`/`g_force_y`/`g_force_z` series according to `axis_horizontal` / `axis_vertical`.
- Invert is applied at the series-read layer: `sample = raw_series[i] * (invert ? -1 : 1)` BEFORE interpolation and BEFORE `max_g` calculation.
- Linear interpolation between samples at the activity's `sample_elapsed_seconds` timestamps (matches the elevation widget's use of `getInterpolatedSeriesValue` in JSX and the equivalent in Rust). No zero-order hold.

### Static / dynamic split (cache contract)

A new `GForceWidgetCache` struct (Rust) and an equivalent in-memory model (JSX) hold precomputed widget state, rebuilt whenever the widget config or the activity changes. The cache contains:

1. The pre-rendered parent circle primitive (path + paint) — Skia image in Rust, SVG path/style in JSX.
2. The derived `max_g` scalar (f64).

The per-frame draw step:
1. Reads the cache for the circle primitive + `max_g`.
2. Interpolates the user-selected `(h, v)` pair at the current frame timestamp.
3. If `h` and `v` are both `None` (series absent or sample missing), renders the dot at centre and the text as "--".
4. Otherwise computes dot position: `dot_x = cx + (h / max_g) · radius`, `dot_y = cy + (v / max_g) · radius`, clamped to `radius` (i.e. `if √(dot_x_off² + dot_y_off²) > radius`, scale the offset vector to `radius`).
5. Computes radial magnitude `√(h² + v²)`, formats with the widget's `text_decimals` and existing decimal formatter (reused from `render/format.rs` in Rust and the JS formatter used by the elevation preview), appends the `text_unit` string.
6. Draws dot at the computed position with cached dot paint, draws the text block at the cached anchor+offset position.

### Cache rebuild rules

The cache is rebuilt when any of:
- The activity changes (e.g. new file imported, current activity replaced).
- Any widget config field changes (geometry, paint, axis mapping, invert, text, `clip_percentile`, `text_decimals`).

Rebuilding recomputes `max_g` via the percentile scan and redraws the circle primitive. Per-frame rendering continues to read the cache without rebuilding.

### Dual-implementation contract

- Rust renders the display type in the Skia render path (in `render/widgets/g_force/` mirroring the `heading_tape` module structure: normalize, prepare, frame-state, draw as appropriate; the structure may collapse modules when functions are trivial, but follows the same owner-ownership split).
- JSX renders the display type as an SVG preview (in `features/widget-preview/widgets/g-force/` mirroring the heading preview's structure: `GForcePreview.jsx`, `useGForcePreview.js`, `style.js` as appropriate).
- `max_g` is computed INDEPENDENTLY by both render paths. Calculation cost is O(N) over the g-force series for the percentile scan — sub-millisecond on a one-hour 10 Hz activity — so no IPC round-trip on axis-mapping edits; the preview updates immediately.
- Text formatting reuses the existing `render/format.rs` decimal formatter on the Rust side and the equivalent JS formatter used by the elevation preview on the JSX side. No new decimal formatter introduced.
- Invert is applied at the same pipeline stage (series-read) in both renderers, with identical multiplier semantics.

### Display type dispatch extension

- `WidgetPreview.jsx` adds a `widget.data.display_type === 'g_force'` clause dispatching to `OverlayGForceWidget`, parallel to the existing display-type clauses.
- The editor layout adds a `display_type === 'g_force'` branch routing to `GForceWidgetEditor`.
- The `RouteMapWidgetEditor` is NOT reused; a dedicated `GForceWidgetEditor.jsx` exposes the axis minitabs, invert switches, and standard gauge geometry/paint controls. The text-controls block reuses the existing shared text controls.

### Editor UX

- The user adds a `g_force` metric widget and selects the new G-Force display type from the dropdown.
- Two rows of axis selectors, each row composed of a shadcn/ui minitab group (`[X|Y|Z]`) plus a shadcn/ui Switch:
  - Row 1: "Horizontal axis" with minitabs `[X|Y|Z]` and an "Invert" switch. Default selected tab `X`, default switch off.
  - Row 2: "Vertical axis" with minitabs `[X|Y|Z]` and an "Invert" switch. Default selected tab `Y`, default switch off.
- Exclusivity: when the user selects an axis for one row, that tab is visually greyed out and unselectable in the other row. The disabled tab carries a tooltip "Already used for Horizontal" or "Already used for Vertical".
- No coordinate-format dropdown, no `display_unit` selector, no `show_full_activity` toggle.
- No UI control for `clip_percentile`. Advanced users edit the manifest directly.
- Standard position/rotation/opacity controls are shared with other metric widgets; standard shadcn/ui color/font controls drive the parent circle paint, dot paint, and text block.
- The widget frame stays square on resize (1:1 aspect ratio). The resize policy scales `diameter`, `border_thickness`, `dot_size`, `text_font_size`, and `text_offset_*` together with `width`/`height`.

### Out of scope for this spec (deferred)

- Concentric reference rings at fixed g intervals.
- Crosshair axis lines through the centre.
- A `scale_mode: "fixed" | "auto_max"` config switch (currently fixed to auto-max derived from the configured percentile; a manually-fixed `max_g` field is not added).
- An "over `max_g`" visual state (clamped samples render identically to at-edge samples; no colour shift, no pulse, no halo).
- An m/s² unit option (no per-axis m/s² series exists; no conversion logic introduced).
- Per-lap recomputation of `max_g` (whole-activity only).
- A max-event marker / trace of past positions (the dot shows only the current-frame vector).
- Three-axis / full 3D representation.
- Reference-envelope scatter / lap trace overlay.

## Testing Decisions

### What makes a good test for this widget

External behaviour only. No tests assert on internal Rust struct layouts, JSX hook internals, or Skia primitive counts. Tests assert:
1. Pure-computation behaviour: given a fixture of g-force samples and a widget config, the computed `max_g`, per-frame dot position, and formatted text match expected values.
2. Rendered SVG output: given a mocked activity and a fixed previewSecond, the JSX preview produces the expected SVG structure (circle element, dot circle, text element) with expected attributes.
3. Editor behaviour: selecting an axis in one row disables that tab in the other row; toggling the invert switch updates the widget config; the preview updates on axis-mapping changes without requiring a backend IPC call.

### Seams at which the widget is tested

Two seams total, both reusing existing patterns.

**Seam 1 — Pure-computation frame-state test (Rust).**

Reuse the existing `elevation_frame_state_tests.rs` pattern at `src-tauri/ovrley_core/src/render/widgets/tests/`. Add a `g_force_frame_state_tests.rs` neighbour that constructs a minimal `ParsedActivity` with known `g_force_x`/`g_force_y`/`g_force_z` series and a `ValidatedGForceWidget` (or equivalent normalized config), calls the widget's prepare/frame-state entry point, and asserts:
- The cached `max_g` matches a hand-computed percentile of `√(h² + v²)`.
- Per-frame dot position for a known sample matches the closed-form `cx + (h/max_g)·radius` and is clamped when it would exceed `radius`.
- Missing-data frames (overall series absent, or a single null sample in an otherwise present series) yield dot at centre.
- Invert produces the sign-flipped dot position.
- Axis remapping (horizontal=`y`, vertical=`z`, etc.) uses the correct series.

Prior art: `elevation_frame_state_tests.rs`, `elevation_geometry_tests.rs`.

**Seam 2 — Frontend SVG preview render test + editor test.**

Reuse the existing `ElevationRenderer.test.jsx` pattern at `app/src/tests/features/widget-preview/`. Add a `GForceRenderer.test.jsx` that:
- Calls `OverlayGForceWidget` with a plain activity fixture (no IPC needed because `max_g` is computed in JSX).
- Renders the widget at a fixed `previewSecond` with a known activity.
- Asserts the parent `<circle>` has the configured `r`, `fill`, `stroke-width`.
- Asserts the dot `<circle>` has its `cx`/`cy` matching the closed-form dot position for the fixture's interpolated sample at `previewSecond`.
- Asserts the text `<text>` content matches `"<magnitude> G"` and the `unit` element matches `"G"`.
- Asserts that an activity with no `g_force_*` series renders the dot at centre and the text content `"--"`.

Add a `GForceWidgetEditor.test.jsx` that asserts:
- Axis exclusivity: clicking a tab already used in the other row is rejected and shows the tooltip.
- Invert switch toggling updates the widget config.
- Preview recomputes on axis remap without a backend IPC call.

Prior art: `ElevationRenderer.test.jsx`, `WidgetPreview-dispatch.test.jsx`, `HeadingTapeDisplaySection.test.jsx`.

### Modules tested

- Rust: `src-tauri/ovrley_core/src/render/widgets/g_force/` (new dir, all functions that produce `max_g`, dot position, and formatted text).
- Rust: `src-tauri/ovrley_core/src/normalize/g_force.rs` (new) — validation.
- JSX: `features/widget-preview/widgets/g-force/` (new dir, `useGForcePreview.js` model hook, `GForcePreview.jsx` presentation component, formatter).
- Editor: `features/widget-editor/components/GForceWidgetEditor.jsx` (new) — asserts axis exclusivity, invert switching, and config propagation.

## Out of Scope

- Reference markings (rings, crosshair axes, axis ticks) inside the parent circle.
- A `scale_mode` config field that switches between fixed `max_g` and auto-derived.
- An m/s² display unit option or any other unit conversion.
- A "trace" of past dot positions (lap envelope scatter).
- Three-axis / 3D g-force representation.
- Per-lap `max_g` recomputation.
- An "over-limit" visual state for clamped samples (no colour shift, no pulse, no halo).
- Reference-line numeric tick labels.
- Custom dot shapes (the dot is a filled circle).
- Exposing `clip_percentile` in the editor UI.
- A `value` field binding the display type to a different metric — it is inherently tied to `g_force`.
- Adding a new `MetricKind` variant to `src-tauri/ovrley_core/src/types.rs`. `GForce` already exists; the display type does not need a new metric variant.
- Custom interaction handling beyond the standard moveable-driven resize (see "Resize uniformity" below).

### Resize uniformity

When the widget is resized via the moveable handles (corner drag only, to preserve square aspect ratio), every dimensional field and every offset field in the widget must scale uniformly with the frame's scale factor — not just `width` and `height`. The widget has no aspect-ratio-independent fields that should stay fixed while the frame grows.

The fields that scale on resize:
- `width`, `height`, `diameter` (the frame stays square and the circle scales with it)
- `border_thickness`
- `dot_size`
- `text_font_size`
- `text_offset_x`, `text_offset_y`

The fields that do NOT scale (they are configuration choices, not geometry):
- Colors, opacities, `text_unit`, `text_decimals`, `clip_percentile`
- Axis selection (`axis_horizontal`, `axis_vertical`)
- Invert switches

The scaling uses the existing `widgetResizeScaling.js` framework: the g-force widget joins the gauge policies as a per-widget-type content-scaling policy. The widget uses corner-only resize handles and a locked 1:1 aspect ratio so the circular instrument never stretches. Same content-scaling policy applies to the `buildScaleDraft` path (the intrinsic-scale interaction used by metric/label/gradient widgets) so that any uniform-scale gesture produces the same proportional result as a moveable resize handle. The Rust render path does not need a new scaling policy — it reads whatever dimensional values the editor commits and renders them.

## Further Notes

- The `g_force` magnitude series currently stored in `ParsedActivity` and `DenseActivityReport` is NOT used by this display type — it includes the `z`-axis component and is therefore inconsistent with the lateral/longitudinal plot decided here. The display type computes its own magnitude `√(h² + v²)` from the per-axis series. No schema change is required; the existing `g_force` magnitude series remains available to the existing `text` display type.
- The `telemetry_math.rs::g_force_from_components` helper subtracts 1 g from the magnitude because the existing `g_force` series is gravity-compensated dynamic load. This display type does NOT use that helper — `g_force_x`/`g_force_y`/`g_force_z` are already in `g` units and already signed; the radial magnitude `√(h² + v²)` does not need gravity compensation because the z gravity component is dropped entirely.
- Per-source axis semantics are NOT normalized at activity ingress in the current codebase (TrackAddict is gravity-compensated/vehicle-frame; AiM is sensor-frame with z-bearing gravity; RaceChrono/RaceBox ship raw sensor data). The display type's axis-picker + invert switches are the user-facing mechanism for resolving this. No per-source frame metadata is introduced by this spec.
- The display type is dispatched by `display_type === 'g_force'`, not by `widget.type === 'g_force'`. The widget's `value` remains `g_force` (the metric kind); the display type controls how that metric is rendered.
- Adding the `g_force` clause to `WidgetPreview.jsx` and the editor dispatch is a one-line dispatcher extension each, mirroring how the other display types are dispatched. No new top-level widget family is introduced in either the editor or the preview.
- The percentile `clip_percentile` is interpreted as the standard nearest-rank percentile of the radial magnitude series. Both renderers must use the same percentile convention (sorting order, tie handling, rank selection for `n` samples) — the frame-state tests pin this; an implementation that uses linear interpolation between ranks would diverge from one that uses nearest-rank, and the test will catch it.
- The `GForceWidgetCache` carries both the static circle primitive and `max_g`. Even though `max_g` is a single scalar and could in principle live elsewhere, putting it on the cache is the natural seam because the same `prepare` step that has access to the activity's samples AND the widget's axis config also has access to the circle geometry. Carrying both on one cache keeps the rebuild contract simple ("any config or activity change → rebuild this one cache").
- The text fields are flattened (`text_font`, `text_font_size`, etc.) in the display-type defaults so that the existing `DISPLAY_VARIANT_KEYS` derivation can preserve them during template normalization without introducing special nested-object handling.

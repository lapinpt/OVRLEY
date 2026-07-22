---
Status: ready-for-agent
---

# Lean Angle Sector Widget Specification

## Problem Statement

OVRLEY already tracks signed `lean_angle` telemetry from activity sources, but the only way to expose it is a plain numeric text widget. Motorsport users (motorcycle riders in particular) expect a visual lean-angle gauge: a bidirectional arc that shows both how far the bike is leaning and in which direction, with the current angle in the center. There is no such display type in the app today.

## Solution

Add a new **`lean_angle` display type** for the existing `lean_angle` metric. It renders as a 120° annular sector centered on the upward vertical axis (a “top frown”). The empty track and border are static; the filled sector sweeps left or right from the centre according to the sign of the signed lean-angle value, and the magnitude of the sweep equals the absolute lean angle clamped to the 60° half-sector limit. The centre of the circle shows the absolute lean-angle value as an integer with a degree unit. The widget is available only for the `lean_angle` metric and is implemented as a dedicated display type in the metric-widget pipeline, mirroring how `heading_tape` is special-cased for the `heading` metric.

## User Stories

### Actor: end user (motorcycle rider / motorsport user)

1. As a user, I want to add a lean-angle widget to my overlay, so that I can see how far I am leaning at any moment in the video.
2. As a user, I want the widget to show lean direction visually (left vs right), so that I can tell which way the bike is leaning without reading a sign.
3. As a user, I want the centre text to always show a positive integer, so that the number is easy to read and never confusingly negative.
4. As a user, I want the degree unit to appear next to the centre value, so that I know the angle is in degrees.
5. As a user, I want the filled sweep to match the actual lean angle 1:1 up to the edge of the sector, so that the visual angle is physically honest.
6. As a user, I want the widget to clamp at the sector edge when my lean exceeds the half-sector limit, so that the fill never breaks out of the gauge.
7. As a user, I want the empty track and fill to use configurable colours and opacities, so that I can match my overlay style.
8. As a user, I want the sector thickness and border thickness to be configurable, so that I can tune the gauge weight against my background video.
9. As a user, I want the centre value font, size, colour, and unit colour to be configurable, so that I can match my overlay typography.
10. As a user, I want to nudge the centre value horizontally and vertically with configurable offsets, so that I can centre it optically inside the empty sector space.
11. As a user, I want the widget to resize as a single locked aspect ratio, so that dragging a corner keeps the sector shape intact.
12. As a user, I want the editor to show a single “Size” control instead of separate width and height, so that I don’t accidentally distort the sector.
13. As a user, I want the preview to update immediately when I change sector colours, thickness, or font settings, so that I can iterate without waiting for a video render.
14. As a user, I want the preview to match the exported video frame-for-frame, so that I am not surprised by the final output.
15. As a user, I want the widget to show `--` when there is no lean-angle data, so that missing data is unambiguous.

### Actor: agent / developer maintaining the codebase

16. As a developer, I want the new widget to be a `display_type` in `assets/standard-metrics.json`, not a new top-level widget family, so that it reuses the metric value pipeline and is restricted to the `lean_angle` metric.
17. As a developer, I want the display type key to be `lean_angle`, so that the metric override list reads naturally as `["text", "lean_angle"]`.
18. As a developer, I want the widget to use the existing signed `lean_angle` series as its source, so that no new activity schema field is needed.
19. As a developer, I want the displayed value to be `abs(raw_lean_angle)` formatted as an integer, so that the centre text is always positive and the sign only drives direction.
20. As a developer, I want positive source values to sweep right and negative source values to sweep left, so that the visual direction matches the signed convention already produced by `lean_angle_from_lateral_g`.
21. As a developer, I want the visual sweep to equal `abs(lean_angle)` clamped to 60° (the half-sector limit), so that the mapping is 1:1 without a configurable max.
22. As a developer, I want the empty track and border to be cached once in the Rust renderer, so that per-frame rendering only draws the dynamic fill and value text.
23. As a developer, I want the fill to be drawn on top of the cached empty track+border and the value text on top of the fill, so that the draw order matches the visual layering decided with the user.
24. As a developer, I want the Rust implementation to follow the same dedicated path as `heading_tape` (validation → prepared value → presentation cache → draw), so that the special display type is isolated from the generic value/gauge paths.
25. As a developer, I want the frontend preview to use its own dedicated module, so that the top-frown geometry and centred text are not special-cased inside the generic arc-gauge preview.
26. As a developer, I want the display-type icon to be a new `display-type-lean-angle.svg` that depicts only an annular sector, so that the picker clearly communicates the widget shape.
27. As a developer, I want the widget to be treated as a gauge for resize scaling, so that `track_thickness`, `track_border_thickness`, `font_size`, and `value_offset_*` all scale uniformly with the frame.
28. As a developer, I want the resize interaction to be aspect-ratio-locked, so that the default 180×140 frame ratio is preserved and the sector never stretches.
29. As a developer, I want the editor property panel to surface a single “Size” control for the widget while still persisting `width` and `height`, so that the UI is simplified without changing the cross-language data contract.
30. As a developer, I want the sector styling keys to follow the established arc-gauge `track_*` convention, so that the schema is consistent with existing gauges.
31. As a developer, I want the text styling keys to follow the established metric value conventions (`font`, `font_size`, `color`, `unit_color`, `show_units`, `value_offset_*`), so that the editor can reuse existing controls.
32. As a developer, I want `decimals` to be hardcoded to `0` and not exposed to the user, so that the value is always an integer degree as specified.
33. As a developer, I want the fill end caps to be flat (no corner radius), so that the widget is a true annular sector and the config surface stays minimal.

## Implementation Decisions

### Manifest placement

- The new display type is added under `displayTypes.definitions.lean_angle` in `assets/standard-metrics.json`.
- The metric override for `lean_angle` is updated to `["text", "lean_angle"]` so that the widget is only available for the `lean_angle` metric.
- No new top-level family is introduced in `assets/standard-widgets.json`.

### Display type schema

```json
{
  "lean_angle": {
    "label": "Lean Angle",
    "icon": {
      "source": "shared",
      "assetFile": "display-type-lean-angle.svg"
    },
    "layoutMode": "boxed",
    "defaultFrameWidth": 180,
    "defaultFrameHeight": 140,
    "defaultFontSize": 60,
    "defaults": {
      "display_type": "lean_angle",
      "show_icon": false,
      "track_empty_color": "#222222",
      "track_empty_opacity": 0.5,
      "track_filled_color": "#dce2e8",
      "track_filled_opacity": 1,
      "track_border_thickness": 0,
      "track_border_color": "#ffffff",
      "track_thickness": 24,
      "font": "Arial.ttf",
      "font_size": 60,
      "color": "#ffffff",
      "unit_color": "#ffffff",
      "show_units": true,
      "value_offset_x": 0,
      "value_offset_y": 0
    }
  }
}
```

- `width` and `height` are frame keys (from `variantFrameKeys`), not part of the display-type defaults; the editor computes them from the default frame size.
- `decimals` is intentionally absent — the value is hardcoded to integer formatting.

### Geometry

- The widget is a **boxed** display type with default frame `180 × 140`.
- The annular sector is a **top frown**: 120° total span, symmetric around the upward vertical axis.
- In the standard SVG/Skia angle convention (0° right, clockwise), the sector spans from 210° to 330° with its centre at 270°.
- The circle centre is placed at the centre of the frame; the sector sits above it.
- The outer radius is derived from the frame so that the sector plus a small margin fits inside the bounding box. The default radius is approximately 100 for the 180×140 frame.
- The value text is rendered at the circle centre, with `value_offset_x`/`value_offset_y` applied after centreing.

### Data mapping and fill

- The signed `lean_angle` series is interpolated per frame using the existing metric interpolation pipeline.
- Let `raw` be the interpolated signed value in degrees.
- `display_value = abs(raw)` formatted as an integer (no decimals, no sign).
- `sweep_magnitude = min(abs(raw), 60°)`.
- Fill direction: positive `raw` sweeps from centre toward the right (330°); negative `raw` sweeps toward the left (210°).
- At `raw == 0`, the fill sector has zero sweep and is invisible; only the empty track is visible.
- The fill sector is drawn as a separate annular sector sharing the same inner/outer radius as the empty track, starting at the centre vertical and extending by `sweep_magnitude` in the computed direction.

### Static / dynamic split

- **Static cache** (prepared once, rebuilt on config/activity change): the empty 120° annular sector path plus its border stroke.
- **Per-frame dynamic**: the fill sector path and the value text (including the unit).
- Draw order per frame: cached empty track+border → fill sector → value text.

### Text and unit

- The value text uses the standard metric value formatter for `lean_angle` (`integer`), but the rendered value is `abs(raw)`.
- The unit (`°`) is rendered inline to the right of the value, using the same convention as the standard temperature/integer formatter (unit font size scales with value font size).
- `show_units` controls unit visibility.
- When the raw sample is missing, the text shows `--` (standard missing-data convention) and the fill sweep is zero.

### Resize and scaling

- The widget is treated as a **uniformly-scaling gauge** by the editor’s resize framework.
- Aspect ratio is locked to the default 180:140.
- When the frame is resized, the following scale together by the same factor:
  - `track_thickness`
  - `track_border_thickness`
  - `font_size`
  - `value_offset_x`
  - `value_offset_y`
- The following do NOT scale (they are config choices):
  - colours, opacities, `show_units`, `show_icon`, `prefix`, `suffix`, `opacity`

### Editor UX

- The widget property panel shows a single **Size** control instead of separate Width and Height inputs.
- The underlying data still stores `width` and `height`; the Size control updates both while preserving the 180:140 aspect ratio.
- Standard position (`x`, `y`), rotation, and widget-level opacity controls remain.
- Sector styling controls reuse the existing arc-gauge styling editors (`track_empty_color`, `track_filled_color`, etc.).
- Text styling controls reuse the existing metric value text editors (`font`, `font_size`, `color`, `unit_color`, `show_units`, `value_offset_x`, `value_offset_y`).

### Rust backend

- A dedicated path mirroring `heading_tape`:
  - `normalize/lean_angle.rs` validates the widget config and produces `ValidatedLeanAngleWidget`.
  - `PreparedValue::LeanAngle` carries the validated widget.
  - `PresentationCache::LeanAngle` holds the pre-rendered static track image/primitive.
  - `render/widgets/lean_angle.rs` draws the per-frame fill and text.
  - `metric_presentation` dispatches `DisplayType::LeanAngle` to the lean-angle draw function.
- A new `DisplayType::LeanAngle` variant is added to the `DisplayType` enum.
- `display_type_layout_mode` returns `Boxed` for `DisplayType::LeanAngle`.
- The widget reads the `lean_angle` dense series by `MetricKind::LeanAngle`.

### Frontend preview

- New dedicated preview module under `features/widget-preview/widgets/lean-angle/`.
- The preview module builds the same top-frown geometry and 1:1 fill mapping as the Rust renderer.
- The preview uses the same static/dynamic split conceptually: the empty track is rendered as an SVG `<path>`; the fill is a separate `<path>` updated per preview frame; the value text is an SVG `<text>` element.
- A new `display-type-lean-angle.svg` icon is added to `assets/widget-icons/` and registered in the display-type icon map.

## Testing Decisions

### What makes a good test

Tests assert external behaviour only. No tests assert internal Rust struct layouts, hook internals, or raw Skia primitive counts. The tests assert:

1. Geometry: given a widget config and frame size, the centre, radius, and sector angles are correct.
2. Data mapping: given a signed lean-angle value, the fill sweep direction and magnitude and the displayed text value are correct.
3. Parity: Rust and JSX compute the same sweep angle and displayed text for the same input.
4. Rendered output: the SVG preview contains the expected empty track path, fill path, and text element with the expected content and styling.
5. Missing data: a null sample renders `--` with zero fill.

### Seams

**Seam 1 — Rust geometry/mapping unit tests.**

Reuse the existing inline widget test pattern (`src-tauri/ovrley_core/src/render/widgets/tests/`). Add a `lean_angle_geometry_tests.rs` neighbour that constructs a minimal `ValidatedLeanAngleWidget`, calls the geometry entry point, and asserts:
- The sector spans 120° centered on the upward vertical.
- The circle centre is at the frame centre.
- Positive values sweep right; negative values sweep left.
- A 30° lean produces a 30° sweep; a 70° lean produces a 60° sweep (clamped).
- The display text is `abs(value)` formatted as an integer.
- A null value produces zero sweep and `--` text.

Prior art: `elevation_frame_state_tests.rs`, `elevation_geometry_tests.rs`.

**Seam 2 — Frontend SVG preview render test.**

Reuse the existing `ElevationRenderer.test.jsx` pattern. Add a `LeanAngleRenderer.test.jsx` that renders the preview at a fixed `previewSecond` with a mocked activity and asserts:
- The empty track `<path>` has the expected `d` and fill/stroke.
- The fill `<path>` sweeps in the correct direction and by the correct angle for positive and negative values.
- The text `<text>` content equals the absolute integer value plus the unit when `show_units` is true.
- A null sample renders `--` and zero fill.

Prior art: `ElevationRenderer.test.jsx`, `WidgetPreview-dispatch.test.jsx`.

**Seam 3 — Rust/JSX parity fixture (proposed new).**

A small JSON fixture containing a few signed lean-angle values and the expected sweep angle, displayed text, and unit visibility for a known config. A Rust test and a Vitest test both read the fixture and assert their respective geometry/mapping functions produce the expected values. This pins the cross-language contract without relying on screenshot parity.

Prior art: `app/src/tests/features/widget-preview/wave1Formatting.test.js` for numeric assertions; `src-tauri/ovrley_core/tests/common/` for Rust fixture helpers.

### Modules tested

- Rust: `src-tauri/ovrley_core/src/render/widgets/lean_angle/` (new) — geometry, mapping, cache, draw.
- Rust: `src-tauri/ovrley_core/src/normalize/lean_angle.rs` (new) — validation.
- JSX: `features/widget-preview/widgets/lean-angle/` (new) — preview model and renderer.
- JSX: widget editor lean-angle display-type branch (property controls and resize policy).

## Out of Scope

- Rounded end caps or a configurable corner radius for the fill sector.
- A configurable maximum lean angle (the mapping is fixed 1:1, clamped at 60°).
- Directional labels such as “L” / “R” or tick marks around the sector.
- Reference markings, concentric rings, or a centre crosshair.
- Per-lap or per-segment lean-angle scaling.
- A trace of past lean-angle positions.
- A three-axis or 3D representation of lean.
- New animation curves beyond the existing per-frame interpolation.
- Support for the `lean_angle` widget on metrics other than `lean_angle`.
- A `decimals` user control — decimals are hardcoded to 0.
- An icon rendered inside the gauge (`show_icon` defaults to false and is not exposed in the editor).
- Changing the underlying data model from `width`/`height` to a single `size` field — the editor UI only hides the split.

## Further Notes

- The `lean_angle` metric already exists in `standard-metrics.json` with `formatter: "integer"`, `defaultDisplayUnit: "degrees"`, and `showUnitsByDefault: true`. The new display type inherits these conventions and only overrides the visual presentation.
- The source `lean_angle` series is signed because `lean_angle_from_lateral_g` returns `-lateral_g.atan().to_degrees()`. The widget’s “positive right / negative left” mapping aligns with this signed convention: a right-hand turn (positive lateral g) yields a negative source value, which sweeps left — matching the physical lean of the bike in a right turn. A left-hand turn yields a positive source value and sweeps right.
- The static/dynamic split is intentionally simple: the empty track and border together form one cache entry because neither depends on the live value. The fill and text depend on the live value and are drawn per frame. The border is drawn behind the fill because it is part of the cached static layer; this is acceptable because the fill is bounded by the same inner/outer radius as the track.
- The resize policy differs from the generic `arc` gauge: while `arc` gauges scale content by the average of width/height factors and allow non-uniform frame distortion, `lean_angle` is strictly aspect-ratio-locked. The editor enforces this by using the existing uniform-resize helpers and by presenting a single Size control.
- The default 180×140 frame is wider than it is tall because the 120° sector’s bounding box is approximately `R·√3` wide and `R/2` tall. The chosen default leaves room for the value text below the sector while keeping the widget compact. The default is explicitly noted as tunable.
- The new display-type icon is intentionally minimal — only an annular sector — so it reads as a display-type shape rather than a motorcycle-specific illustration.

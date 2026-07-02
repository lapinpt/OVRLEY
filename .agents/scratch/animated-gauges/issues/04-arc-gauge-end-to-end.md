Status: ready-for-agent

## Parent

`.agents/scratch/animated-gauges/PRD.md`

## What to build

Implement the arc gauge display type end-to-end: Skia backend rendering with static/dynamic layer split, React frontend SVG preview, widget editor controls, and the inner text widget layout system. This slice reuses all shared track styling and static layer infrastructure from the linear gauge slice, and introduces arc geometry and inner widget layout that the corner gauge slice will reuse.

NON-NEGOTIABLE: design-principles.md contains the blueprint for implementing animated gauges. The architectural principles and design decisions in that document are non-negotiable and must be followed, otherwise the code will be rejected. The rendering DETAILS may deviate and you must always study LinearGaugeRenderer.jsx and linear_gauge.rs for reference (e.g. borders, corner rounding etc) but the principles and architecture are non-negotiable.

**Backend behavior:**

- When `display_type` is `"arc"`, the widget renders a circular arc track with configurable angle (30°–360°). The metric text widget (value + unit) remains visible inside the arc.
- Arc is symmetric along the vertical axis. 180° produces a half-circle starting and ending on a horizontal line.
- Arc radius derived from widget bounding box: `min(width, height) / 2 - padding` (padding accounts for track thickness).
- Fill sweeps from the leftmost arc endpoint to the rightmost arc endpoint, always reading left-to-right.
- Rounded arc ends should be implemented with Skia stroke caps (`Round`) on a stroked arc, not custom rounded path geometry. This is based on the upstream Cyclemetry renderer reviewed in `walkersutton/Cyclemetry/src-tauri/src/render/frame.rs`. Maximum corner radius is half the track thickness, like for linear gauges.
- Static layer: empty arc track + border + min/max labels (if enabled) + unit label.
- Dynamic per frame: arc fill + value text. Value text changes per frame; unit are static.
- Inner widget layout: unit appears below value (vertical stacking, not horizontal row). There is no icon. The value and units are always centered against each other horizontally. Check value/metric widget to understand which customization options are available for the inner widget (font size, fong type, unit, unit color).
- Inner widget position controlled by `inner_widget_offset_x` and `inner_widget_offset_y` relative to arc center.
- No auto-sizing or overlap clamping — user controls and font size, overlap is their responsibility.

**Frontend behavior:**

- SVG preview renders identically to the Skia backend for the same config.
- Rounded arc ends should be mirrored with SVG round linecaps / equivalent stroke-cap behavior so preview and export stay aligned.
- Editor controls: display type dropdown, arc angle slider/input, inner widget x/y offset, plus all shared track styling controls.

**Infrastructure established:**

- `inner_widget_offset_x` and `inner_widget_offset_y` fields on `ValueConfig`.
- `arc_angle` field on `ValueConfig` (30–360 range).
- Arc geometry calculation functions (start/end angles from arc angle, radius derivation).
- Inner widget vertical stacking layout (unit below value).

## Acceptance criteria

- [ ] `arc_angle`, `inner_widget_offset_x`, `inner_widget_offset_y` fields added to `ValueConfig` with `#[serde(default)]`
- [ ] Arc gauge static layer (empty arc + border + min/max labels + unit label) baked into cached `SkiaImage`
- [ ] Arc gauge dynamic fill rendered per-frame with correct sweep direction (left-to-right)
- [ ] Arc angle range enforced: 30°–360°
- [ ] Arc radius correctly derived from widget bounding box minus padding
- [ ] Rounded arc ends rendered via stroke-cap strategy in both Skia and SVG preview
- [ ] Inner widget value text rendered per-frame inside arc
- [ ] Inner widget unit label rendered in static layer (vertical stacking layout)
- [ ] Inner widget positioned by x/y offset from arc center
- [ ] There is no icon for this widget.
- [ ] No auto-sizing or overlap clamping for inner widget
- [ ] Frontend SVG preview renders arc gauge identically to Skia backend
- [ ] Frontend editor controls for arc angle, inner widget offsets
- [ ] Rust unit tests for arc angle geometry (start/end angles for various angles)
- [ ] Frontend tests for arc geometry calculations and inner widget layout

## Blocked by

- None - can start immediately

Status: ready-for-agent

## Parent

`.agents/scratch/animated-gauges/PRD.md`

## What to build

Implement the corner gauge display type end-to-end: Skia backend rendering with static/dynamic layer split, React frontend SVG preview, and widget editor controls. This slice reuses all arc rendering and inner widget layout infrastructure from the arc gauge slice.

NON-NEGOTIABLE: design-principles.md contains the blueprint for implementing animated gauges. The architectural principles and design decisions in that document are non-negotiable and must be followed, otherwise the code will be rejected. The rendering DETAILS may deviate and you must always study LinearGaugeRenderer.jsx and linear_gauge.rs for reference (e.g. borders, corner rounding etc) but the principles and architecture are non-negotiable.

**Backend behavior:**

- When `display_type` is `"corner"`, the widget renders a fixed 90° arc positioned in one of two corners: bottom-left, bottom-right.
- The metric text widget (value + unit) remains visible and customizable, identical to arc gauge inner widget behavior.
- Fill sweeps left-to-right with direction depending on corner:
  - Bottom-left: left edge → bottom edge (clockwise)
  - Bottom-right: bottom edge → right edge (clockwise)
- Static layer: empty arc track + border + min/max labels (if enabled) + unit label.
- Rounded corner-gauge arc ends should reuse the arc gauge's stroke-cap strategy (`Round` caps on stroked arcs), following the same approach observed in the upstream Cyclemetry renderer rather than custom rounded path geometry.
- Dynamic per frame: arc fill + value text.
- All inner widget customization (x/y offset, font size) works identically to arc gauge.
  The value and units are always centered against each other horizontally.

**Frontend behavior:**

- SVG preview renders identically to the Skia backend for the same config.
- Rounded arc ends should be mirrored with SVG round linecaps / equivalent stroke-cap behavior.
- Editor controls: display type dropdown, corner orientation selector (bottom-left/bottom-right), plus all shared track styling and inner widget controls.

## Acceptance criteria

- [ ] `corner_orientation` field added to `ValueConfig` with variants ``"bottom-left"`, `"bottom-right"` and `#[serde(default)]`
- [ ] Corner gauge static layer baked into cached `SkiaImage` (reuses arc infrastructure)
- [ ] Corner gauge dynamic fill rendered per-frame with correct sweep direction per corner orientation
- [ ] Rounded corner-gauge arc ends rendered via stroke-cap strategy in both Skia and SVG preview
- [ ] Bottom-left: clockwise sweep from left edge to bottom edge
- [ ] Bottom-right: clockwise sweep from right edge to bottom edge
- [ ] There is no icon for this widget.
- [ ] Inner widget (value + unit) rendered identically to arc gauge
- [ ] Frontend SVG preview renders corner gauge identically to Skia backend
- [ ] Frontend editor controls for corner orientation
- [ ] Rust unit tests for corner sweep direction and start/end angles per orientation
- [ ] Frontend tests for corner geometry calculations

## Blocked by

- `#04-arc-gauge-end-to-end.md`

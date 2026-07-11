Status: ready-for-agent

## Parent

`.agents/scratch/animated-gauges/PRD.md`

## Supersedes

`#03-bars-gauge-end-to-end.md` — the original strategy introduced `bars` as a
standalone top-level `display_type`. This slice replaces it with a reusable
fill-style concept described below. Issue #03 is cancelled (`wontfix`).

## What to build

Introduce segmented bars as an **alternative track fill style** that any gauge
display type can opt into, rather than as a separate `bars` display type. Both
the linear gauge and arc gauge gain a `track_fill_style` toggle with two
values:

- `"fill"` (default) — the current continuous-fill behaviour, unchanged.
- `"bars"` — the track is rendered as a discrete array of segments separated
  by configurable gaps. Each segment is either fully on or fully off; no
  segment is ever partially filled.

When `track_fill_style === "bars"`, two new settings become active and are
exposed in the editor:

- `bar_count` — number of discrete segments (integer ≥ 1).
- `bar_gap` — pixel gap between adjacent segments (≥ 0, clamped so each
  segment keeps a minimum width).

Because `track_fill_style`, `bar_count`, and `bar_gap` live on the shared
`ValueConfig` and are consumed by each gauge's renderer, the bars concept is
reusable by any future gauge widget that joins the system — there is no
per-gauge `bars` variant to re-implement. Corner gauges, once built, will
inherit arc-gauge bars behaviour for free.

NON-NEGOTIABLE: `design-principles.md` contains the blueprint for implementing
animated gauges. The architectural principles and design decisions in that
document are non-negotiable and must be followed, otherwise the code will be
rejected. The rendering details may deviate, but you must always study
`LinearGaugeRenderer.jsx`, `linear_gauge.rs`, `ArcGaugeRenderer.jsx`, and
`arc/mod.rs` for reference (e.g. borders, corner rounding, static/dynamic
split). The bars fill style is layered on top of the existing track
infrastructure — it must not fork the rendering pipeline per gauge.

### Config model

A new field on `ValueConfig` selects how the filled portion of the track is
painted:

```rust
// src-tauri/ovrley_core/src/types.rs
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub enum TrackFillStyle {
    #[serde(rename = "fill")]
    #[default]
    Fill,
    #[serde(rename = "bars")]
    Bars,
}
```

`Deserialize` falls back to `Fill` for missing/null/unrecognised values, mirroring
`DisplayType`'s forgiving deserializer. `as_str()` returns `"fill"` / `"bars"`.

`ValueConfig` gains three optional `#[serde(default)]` fields (per
design-principles §2 — every field is `Option<T>`; validation makes them
required downstream):

```rust
// src-tauri/ovrley_core/src/normalize/raw/mod.rs
#[serde(default)]
pub track_fill_style: Option<TrackFillStyle>,
#[serde(default)]
pub bar_count: Option<u32>,
#[serde(default)]
pub bar_gap: Option<f32>,
```

`track_fill_flat` (the existing per-gauge toggle) is **ignored** in bars mode.
Ignoring it is the only sensible behaviour: in bars mode each segment is
either fully on or fully off — there is no partially-filled advancing edge to
render, so the "flat progressing edge" concept has no meaning. Every filled
bar uses the full `track_corner_radius` on all corners (linear) or both caps
(arc). The `track_fill_flat` control is hidden/disabled in the editor when
`track_fill_style === "bars"`.

### Shared bar bucket logic (the single source of truth)

Fill fraction → discrete bar bucket determination is shared across every gauge
that supports bars. It is the bars fill style's equivalent of
`fill_percentage()` and must be implemented once and reused.

For a value `v`, range `[min, max]`, and bar count `N`, with `fill01` already
clamped to `[0,1]`: the highest filled bar index is
`i_max = floor(fill01 * N) - 1` clamped to `[-1, N-1]`. Bar `i`
(0-indexed, advancing in the gauge's native fill direction) is **filled** iff
`i <= i_max`.

Equivalently (and matching the formula in the original bars issue for parity
testing): bar `i` is filled iff
`value >= min + ((i + 1) / bar_count) * (max - min)`,
with `value` clamped to `[min, max]` first.

`max == min` (degenerate range) → `i_max = -1` → no bars filled (matches the
`fill_percentage` guard that returns 0.0 for `max <= min`).

Shared helper location:

- Rust: `render/widgets/gauges/range.rs` — add
  `pub fn bar_fill_count(fill01: f32, bar_count: u32) -> usize` returning the
  number of filled bars, plus a thin `bar_is_filled(fill01, bar_count, i)`
  wrapper if convenient. The renderer iterates `0..bar_count` and compares
  against the count.
- JS: `widget-preview/utils/gaugeBarGeometry.js` (new) —
  `getBarFillCount(fill01, barCount)` and `getBarGeometry({ ... })` helpers
  consumed by both renderers. Mirror the Rust formula exactly.

### Linear gauge — bars behaviour

Rendering is layered onto `linear/mod.rs` and `LinearGaugeRenderer.jsx` without
introducing a separate code path for the static/dynamic split.

**Geometry:** segments are laid out along the fill axis.

- Horizontal: bars arranged left-to-right; bar `0` is on the left. Per-bar
  rect is `{ x: inset + i * (barW + gap), y: inset, width: barW, height:
  innerH }`.
- Vertical: bars arranged bottom-to-top; bar `0` is on the bottom. Per-bar
  rect is `{ x: inset, y: inset + innerH - (i + 1) * (barH + gap), width:
  innerW, height: barH }`.

Per-bar dimension (the "bar sizing" formula from the PRD, valid for both
axes):

- available span `S = inner_extent` (inner width for horizontal, inner height
  for vertical — after border inset).
- `gap = bar_gap.clamp(0, max_gap)` where `max_gap` is the largest gap
  satisfying `(S - (N - 1) * gap) / N >= MIN_BAR_PX` with `MIN_BAR_PX = 2.0`.
  Equivalently `max_gap = (S - N * MIN_BAR_PX) / (N - 1).max(1)`.
- `bar_extent = (S - (N - 1) * gap) / N`, clamped to `>= MIN_BAR_PX`.

**Static layer:** unchanged — empty track + border + min/max labels, drawn once
into the cached `SkiaImage`. In bars mode, the static empty track is still the
continuous inner track (the gaps reveal the empty track colour behind them)
— there is no static per-bar background to bake. (If a visual gap colour
distinct from the empty track is needed later, add an optional field; out of
scope here. The gap simply shows the empty track colour.)

**Dynamic per frame:** in bars mode, iterate `0..bar_count`, compute the
per-bar rect, and for each filled bar draw it with the fill paint. Per-bar
corner radius uses the existing `track_corner_radius` (minus border), clamped
to `min(bar_extent, cross_extent) * 0.5`.

`track_fill_flat` is ignored in bars mode (see "Config model" above); filled
bars always use the full corner radius on all four corners.

### Arc gauge — bars behaviour

Layered onto `arc/mod.rs` and `ArcGaugeRenderer.jsx`. Sparked bars sweep along
the arc's existing fill direction (left-to-right per the PRD).

**Geometry:** the arc sweep is divided into `N` angular segments.

- Per-segment sweep = `(sweep_angle / N)`, minus an angular gap. The angular
  gap is derived from `bar_gap` so segments stay visually proportional to the
  pixel gap a linear gauge would show: `gap_angle = bar_gap / radius` (in
  radians), clamped so a segment keeps a minimum angular extent. `full-circle`
  arcs (`sweep == 360°`) get segments with no caps (reuse the existing
  `full_circle` branch in `ArcTrackSpec`).
- Bar `0` is at `start_angle`; bar `i` spans
  `[start + i * seg + i * gap_angle, start + (i + 1) * seg + i * gap_angle]`
  where `seg = (sweep - (N - 1) * gap_angle) / N`.

**Static layer:** unchanged — empty arc track + border + min/max labels + unit.
The gaps reveal the empty arc track colour.

**Dynamic per frame:** for each filled bar, build an `ArcTrackSpec` with that
bar's sub-sweep and endpoint corner radii (reuse `ArcTrackSpec::full`-style
construction with the bar's own sweep and `start_corner_radius` /
`end_corner_radius`), then `draw_revealed_arc_track(canvas, spec, 1.0, &paint)`
(whole bar is "revealed" — it is on or off, never partial). Equivalently draw
each filled bar's arc path directly.

`track_fill_flat` is ignored in bars mode (see "Config model" above); filled
bars always use the full `track_corner_radius` on both caps.

### Frontend editor

Both `LinearDisplaySection.jsx` and `ArcDisplaySection.jsx` gain a "Fill Style"
control (a `SelectField` with `"fill"` / `"bars"` options) placed near the
existing `track_fill_flat` toggle in the gauge-track section. When the style is
`"bars"`, two controls become visible (and are hidden otherwise):

- `bar_count` — integer `SliderField`, min 1, max ~64 (chosen so the UX stays
  useful; clamp in the updater).
- `bar_gap` — `SliderField`, min 0, max bounded by the layout (clamp via the
  shared helper or a per-gauge max), step 1, `${value}px` display.

The `track_fill_flat` toggle is **hidden/disabled** when
`track_fill_style === "bars"` (it has no meaning for discrete bars — see
"Config model" above), and remains visible in `fill` mode with its existing
behaviour. The width/height/orientation/arc-angle controls and all
track-styling controls remain unchanged — bars reuses them. Write updates
through the existing `useDisplayVariantUpdater` so bars config lives in
`display_variants.<gauge>`, the same as the rest of the gauge fields.

### Manifest

`assets/standard-metrics.json` — add `bar_count` and `bar_gap` to the
`defaults` of both the `linear` and `arc` display-type definitions (e.g.
`"bar_count": 5, "bar_gap": 2`), and add `"track_fill_style": "fill"` as a
default to both. The `"bars"` definition in `displayTypes.definitions` is
**removed** (it was never wired through); nothing references it because no
`BarsGauge` renderer was ever registered. Removing it keeps the
display-type dropdown free of a dead entry.

## Acceptance criteria

### Backend

- [ ] `TrackFillStyle` enum added to `types.rs` with `Fill` / `Bars`
      variants, `as_str()`, and a forgiving `Deserialize` falling back to
      `Fill`.
- [ ] `track_fill_style: Option<TrackFillStyle>`, `bar_count: Option<u32>`,
      `bar_gap: Option<f32>` added to `ValueConfig` with `#[serde(default)]`.
- [ ] `bar_fill_count(fill01, bar_count)` added to
      `render/widgets/gauges/range.rs`; `fill_percentage` and `metric_range`
      are reused unchanged.
- [ ] `ValidatedLinearGaugeWidget` and `ValidatedArcGaugeWidget` gain
      `track_fill_style`, `bar_count`, `bar_gap` concrete fields; the
      validators require them when `track_fill_style == Bars` (or apply
      sensible defaults — `fill` style with `bar_count`/`bar_gap` ignored),
      and validate ranges (`bar_count >= 1`, `bar_gap >= 0`, gap clamped to
      keep `>= 2px` bars).
- [ ] Linear gauge renderer draws N discrete filled bars in bars mode along
      the fill axis, with per-bar corner radius and gap. `fill` mode unchanged.
- [ ] Arc gauge renderer draws N discrete filled arc segments along the
      sweep in bars mode, reusing `ArcTrackSpec` / `draw_revealed_arc_track`.
      `fill` mode unchanged.
- [ ] `track_fill_flat` is ignored in bars mode — filled bars always use the
      full `track_corner_radius` on all corners (linear) / caps (arc). The
      `fill`-mode `track_fill_flat` behaviour is unchanged.
- [ ] Static/dynamic split preserved: empty track + border + labels remain in
      the cached `SkiaImage`; only filled bars are drawn per frame.
- [ ] Existing `fill`-style gauges and `text` widgets render unchanged — zero
      regression.
- [ ] Rust unit tests for `bar_fill_count` (edge cases: fill01 = 0, exactly
      one bar, exactly N bars, fill01 > 1, N = 1, degenerate range) and the
      bar-sizing / angular-gap clamping formulas.

### Frontend

- [ ] `widget-preview/utils/gaugeBarGeometry.js` with `getBarFillCount` and
      `getBarGeometry` pure helpers mirroring the Rust formulas.
- [ ] `LinearGaugeRenderer.jsx` renders discrete bars when
      `data.track_fill_style === 'bars'`, reusing the existing static-track
      SVG and adding per-bar filled `<rect>`s with the full corner radius
      (`track_fill_flat` ignored).
- [ ] `ArcGaugeRenderer.jsx` renders discrete arc segments in bars mode,
      reusing `getArcFilledTrackPath` per bar with per-bar sweep and caps.
- [ ] `LinearDisplaySection.jsx` and `ArcDisplaySection.jsx` expose the
      Fill Style dropdown plus `bar_count` / `bar_gap` sliders (hidden unless
      style is `bars`), writing through `useDisplayVariantUpdater`.
- [ ] `assets/standard-metrics.json`: `bar_count`, `bar_gap`,
      `track_fill_style` added to `linear` and `arc` defaults; `"bars"`
      display-type definition removed.
- [ ] Frontend tests for `gaugeBarGeometry` (bucket count, sizing clamping,
      angular gap) and renderer tests asserting bars-mode SVG output for both
      linear and arc.

## Blocked by

- None — linear (#02) and arc (#04) gauges are already implemented; this slice
  layers on top of them.
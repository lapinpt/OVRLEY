Status: ready-for-agent

## Parent

`.agents/scratch/animated-gauges/PRD.md`

## Supersedes

`#03-bars-gauge-end-to-end.md` — the original strategy introduced `bars` as a
standalone top-level `display_type`. This slice replaces it with a reusable
fill-style concept described below. Issue #03 is cancelled (`wontfix`), but
its discrete-bar behavior (empty segments in the static layer, filled segments
per frame, orientation, sizing, and bucket thresholds) remains the behavioral
baseline.

## What to build

Introduce segmented bars as an **alternative track fill style** that any gauge
display type can opt into, rather than as a separate `bars` display type. The
linear gauge and both arc-shaped variants (`arc` and `corner`) gain a
`track_fill_style` toggle with two values:

- `"fill"` (default) — the current continuous-fill behaviour, unchanged.
- `"bars"` — the continuous track is replaced by a discrete array of segments
  separated by configurable gaps. Each segment is either fully on or fully
  off; no segment is ever partially filled. An off segment uses the existing
  empty-track colour and an on segment uses the existing fill colour. The gaps
  are transparent: there is no track or gap-colour layer behind the segments.

When `track_fill_style === "bars"`, two new settings become active and are
exposed in the editor:

- `bar_count` — optional explicit number of discrete segments (integer ≥ 1).
  When absent, derive a suitable count from the current track geometry.
- `bar_gap` — optional explicit pixel gap between adjacent segments (≥ 0).
  When absent, derive a suitable gap from the current track thickness. Explicit
  and derived gaps are both clamped so each segment keeps a minimum width.

Do not seed fixed `bar_count` / `bar_gap` values when a widget is created or
when the user switches to bars. Absence means **auto**, not "missing config".
Auto values are resolved again whenever width, height, track thickness,
arc angle, or corner geometry changes. This is especially important for arc
and corner gauges: a count that looked balanced at one radius or sweep can look
absurd after resizing.

Because `track_fill_style`, `bar_count`, and `bar_gap` live on the shared
`ValueConfig` and are consumed by each gauge's renderer, the bars concept is
reusable by any future gauge widget that joins the system — there is no
per-gauge `bars` variant to re-implement. Corner gauges reuse the arc renderer
and therefore use the same segmented-track behavior, with their existing fixed
sweep and orientation.

NON-NEGOTIABLE: `design-principles.md` contains the blueprint for implementing
animated gauges. The architectural principles and design decisions in that
document are non-negotiable and must be followed, otherwise the code will be
rejected. The rendering details may deviate, but you must always study
`LinearGaugeRenderer.jsx`, `linear_gauge.rs`, `ArcGaugeRenderer.jsx`, and
`arc/mod.rs` for reference (e.g. borders, corner rounding, static/dynamic
split). The bars fill style is layered on top of the existing track
infrastructure — it must not fork the rendering pipeline per gauge.

### Config model

A new field on `ValueConfig` selects the track geometry and how its filled
state is painted:

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

`Deserialize` falls back to `Fill` for an unrecognised value, mirroring
`DisplayType`'s forgiving deserializer. At the optional `ValueConfig` field,
missing or `null` becomes `None`; gauge validation resolves `None` to `Fill`.
`as_str()` returns `"fill"` / `"bars"`.

Because bars is no longer a display type, remove `DisplayType::Bars` and its
`as_str()` arm along with obsolete dispatch/editor/test references. A legacy
top-level `display_type: "bars"` was never supported by a registered renderer
and continues to follow the existing forgiving `DisplayType` fallback rather
than being migrated implicitly to a particular gauge shape.

`ValueConfig` gains three optional `#[serde(default)]` fields. Unlike ordinary
required downstream fields, `bar_count: None` and `bar_gap: None` deliberately
survive as auto-mode inputs until gauge geometry is known:

```rust
// src-tauri/ovrley_core/src/normalize/raw/mod.rs
#[serde(default)]
pub track_fill_style: Option<TrackFillStyle>,
#[serde(default)]
pub bar_count: Option<u32>,
#[serde(default)]
pub bar_gap: Option<f32>,
```

Validated/render-cache gauge data stores the resolved concrete count and gap
plus enough information for the editor/debug layer to distinguish auto from an
explicit override. Never write a derived value back into persisted widget
config merely because it was resolved for rendering.

### Automatic bar geometry

Resolve automatic values from logical (pre-output-scale) track geometry in one
shared Rust helper and one frontend helper implementing the same documented
contract:

- `S` is the available span along the track: the linear track extent or the
  arc centerline length `abs(sweep_radians) * radius`.
- `T` is the outer cross-track thickness, including the configured border.
- `MIN_BAR_PX = 2.0`.
- If `bar_gap` is absent, use
  `auto_gap = clamp(0.20 * T, 2.0, 6.0)` logical pixels.
- If `bar_count` is absent, use target bar extent
  `target_bar = clamp(T, 8.0, 24.0)` and resolve
  `N = round((S + gap) / (target_bar + gap))`.
- Clamp an automatic `N` to `1..=floor(S / MIN_BAR_PX)`. When at least three
  bars fit, use a minimum automatic count of three so short arc/corner gauges
  still read as segmented rather than as a split continuous track.
- After resolving `N`, clamp the gap with the sizing rules below. `N == 1`
  always resolves to gap `0`.

These constants are shared visual-design constants, not manifest defaults.
They intentionally make density follow the live geometry. Explicit
`bar_count` and/or `bar_gap` override only their corresponding automatic
input; for example, an explicit gap with auto count participates in the count
formula. Both implementations consume the constants and formulas documented
here; cross-renderer parity validation is handled separately by the product
owner as described below.

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

Equivalently (and retaining the formula in the original bars issue): bar `i`
is filled iff
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
  consumed by both renderers. Implement the documented bucket contract
  directly; do not add cross-backend parity harnesses or fixtures.

### Linear gauge — bars behaviour

Rendering is layered onto `linear/mod.rs` and `LinearGaugeRenderer.jsx` without
introducing a separate code path for the static/dynamic split.

**Geometry:** segments are laid out along the fill axis.

- Horizontal: bars arranged left-to-right; bar `0` is on the left. Its outer
  rect is `{ x: trackX + i * (barW + gap), y: trackY, width: barW, height:
  trackH }`.
- Vertical: bars arranged bottom-to-top; bar `0` is on the bottom. Its outer
  rect is `{ x: trackX, y: trackY + trackH - barH - i * (barH + gap), width:
  trackW, height: barH }`.

The empty paint and border use the outer rect. The fill paint uses that same
segment's border-inset interior; the border inset must not shift the segment
spacing or turn the transparent gap into empty-track pixels.

Per-bar dimension (the "bar sizing" formula from the PRD, valid for both
axes):

- available span `S = track_extent` (track width for horizontal, track height
  for vertical). It is divided into the outer extents of the segments; any
  configured border is then inset within each segment independently.
- `MIN_BAR_PX = 2.0`. A bars configuration is geometrically valid only when
  `S >= N * MIN_BAR_PX`; existing minimum gauge dimensions must guarantee
  `S >= MIN_BAR_PX`. The editor constrains an explicit `bar_count` to
  `floor(S / MIN_BAR_PX)`, and backend validation rejects an explicit count
  that cannot fit. Automatic count resolution already obeys this bound. Do
  not silently render fewer explicitly requested bars, because that would also
  change the fill thresholds.
- For `N == 1`, `gap = 0` and `bar_extent = S`.
- For `N > 1`, `max_gap = (S - N * MIN_BAR_PX) / (N - 1)` and
  `gap = bar_gap.clamp(0, max_gap)`.
- `bar_extent = (S - (N - 1) * gap) / N`. With the validity check above this
  is guaranteed to be `>= MIN_BAR_PX`; do not clamp it independently because
  doing so could make the segments overflow `S`.

**Static layer:** the static/dynamic split is preserved, but the track geometry
changes in bars mode. Bake all `N` off segments into the cached `SkiaImage`,
using the existing empty-track paint and applying the existing track border to
each segment. Do not draw a continuous track behind them. Pixels between
segments remain transparent, so the overlay content beneath the gauge is
visible through each gap. Min/max labels remain in the static image.

**Dynamic per frame:** in bars mode, iterate `0..bar_count`, compute the
per-bar rect, and for each filled bar draw the segment's interior with the fill
paint, preserving its cached border. Per-bar corner radius uses the existing
`track_corner_radius` (minus border for the interior), clamped to
`min(bar_extent, cross_extent) * 0.5`.

`track_fill_flat` is ignored in bars mode (see "Config model" above); filled
bars always use the full corner radius on all four corners.

### Arc and corner gauges — bars behaviour

Layered onto `arc/mod.rs` and `ArcGaugeRenderer.jsx`, including the corner mode
already handled by those implementations. Segmented bars advance along the
configured gauge's existing start angle and sweep direction.

**Geometry:** the arc sweep is divided into `N` angular segments.

- Treat `bar_gap` as the visible edge-to-edge gap between adjacent outer
  segment paths, consistent with the linear gauge. Convert it to angular
  separation at the track centerline. The geometry helper must account for
  the tangential extension of rounded caps (and the outer border shape); the
  naive `bar_gap / radius` conversion is sufficient only for flat caps and
  must not let rounded neighbouring segments paint into the gap.
- The available centerline arc length is
  `S = abs(sweep_angle_radians) * radius`. Apply the same `N == 1`, minimum
  2px segment extent, impossible-count validation, and maximum-gap rules as
  the linear gauge in arc-length space, then convert the resulting segment
  and endpoint-gap spans to angles. Even when the overall sweep is `360°`,
  every bar is an open sub-arc with two endpoints; apply the configured caps
  to each bar rather than treating the bars as full circles.
- Bar `0` is at `start_angle`; bar `i` spans
  `[start + i * seg + i * gap_angle, start + (i + 1) * seg + i * gap_angle]`
  where `seg = (sweep - (N - 1) * gap_angle) / N`. Preserve the sign of the
  configured sweep when advancing segment starts; do sizing with magnitudes.

**Static layer:** bake `N` discrete off arc segments, using the existing
empty-track paint and applying the existing track border to each segment. Do
not draw a continuous empty arc behind them. The angular gaps remain
transparent. Min/max labels and the unit remain in the static image.

**Dynamic per frame:** for each filled bar, build an `ArcTrackSpec` with that
bar's sub-sweep and endpoint corner radii (reuse `ArcTrackSpec::full`-style
construction with the bar's own sweep and `start_corner_radius` /
`end_corner_radius`), then draw its interior with the fill paint while
preserving the cached per-segment border (whole bar is "revealed" — it is on
or off, never partial). Equivalently draw each filled bar's arc path directly.

`track_fill_flat` is ignored in bars mode (see "Config model" above); filled
bars always use the full `track_corner_radius` on both caps.

### Frontend editor

Both `LinearDisplaySection.jsx` and `ArcDisplaySection.jsx` gain a "Fill Style"
control (a `SelectField` with `"fill"` / `"bars"` options) placed near the
existing `track_fill_flat` toggle in the gauge-track section. Because
`ArcDisplaySection` also edits `corner`, the controls must read and write the
active `display_variants.arc` or `display_variants.corner` object rather than
hard-code the arc key. When the style is `"bars"`, two controls become visible
(and are hidden otherwise):

- `bar_count` — an Auto/Custom control. Auto leaves the field absent and shows
  the currently derived count as read-only context. Custom exposes an integer
  `SliderField`, min 1, max ~64 (further bounded by the active track span so a
  segment remains at least 2px). Switching back to Auto deletes the override.
- `bar_gap` — an Auto/Custom control. Auto leaves the field absent and shows
  the currently derived gap. Custom exposes a `SliderField`, min 0, max bounded
  by the layout, step 1, `${value}px` display. Switching back to Auto deletes
  the override.

Changing gauge dimensions or track geometry updates displayed auto values
without mutating widget config. Explicit custom values remain user-owned; if a
dimension edit would make an explicit count invalid, constrain that dimension
edit or surface validation instead of silently replacing the user's count.

The `track_fill_flat` toggle is **hidden/disabled** when
`track_fill_style === "bars"` (it has no meaning for discrete bars — see
"Config model" above), and remains visible in `fill` mode with its existing
behaviour. The width/height/orientation/arc-angle controls and all
track-styling controls remain unchanged — bars reuses them. Write updates
through the existing `useDisplayVariantUpdater` so bars config lives in
`display_variants.<gauge>`, the same as the rest of the gauge fields.

### Manifest

`assets/standard-metrics.json` — do **not** add `bar_count` or `bar_gap` to
the `linear`, `arc`, or `corner` defaults; their absence enables responsive
automatic geometry. Add `"track_fill_style": "fill"` as a default to all
three. The `"bars"` definition in `displayTypes.definitions` is
**removed** (it was never wired through); nothing references it because no
`BarsGauge` renderer was ever registered. Removing it keeps the
display-type dropdown free of a dead entry.

## Required implementation order

Implement this issue in the following order. The ordering is part of the
acceptance contract:

1. Complete the full production implementation and author the required tests,
   but do **not** execute any test, formatter, linter, type-check, or other
   verification command yet.
2. Apply the repository's `/debloat` skill to every production and test file
   touched by this issue. Establish the canonical Auto/Custom config contract,
   remove consumer-side repair and duplicate geometry vocabulary, keep
   automatic resolution at its owning geometry boundary, move reusable logic
   out of renderer/editor components, and prune unused helpers and branches.
3. Inspect/search the complete touched-file diff as required by `/debloat` and
   finish all cleanup edits.
4. Only after the debloat pass is complete, run focused tests followed by the
   repository's formatter, linter, type checks, broader relevant test suites,
   and `git diff --check`.

Writing tests during implementation is expected; running them before the
debloat gate is not. If the post-debloat verification exposes a failure, fix
it, reapply `/debloat` to the newly touched code, and only then rerun tests.

### Parity testing ownership

Do not author or execute Rust-versus-SVG parity tests, golden-image comparisons,
cross-backend fixture comparisons, or manual parity checks as part of this
implementation. Parity testing and parity sign-off belong to the product owner
after implementation handoff. This exclusion applies both before and after the
debloat gate. Ordinary backend/frontend unit and renderer tests may verify
their own observable behavior independently, but must not claim parity between
the two implementations.

## Acceptance criteria

### Backend

- [ ] `TrackFillStyle` enum added to `types.rs` with `Fill` / `Bars`
      variants, `as_str()`, and a forgiving `Deserialize` falling back to
      `Fill`.
- [ ] The obsolete `DisplayType::Bars` variant, `as_str()` branch, and any
      stale top-level bars dispatch/editor/test references are removed.
- [ ] `track_fill_style: Option<TrackFillStyle>`, `bar_count: Option<u32>`,
      `bar_gap: Option<f32>` added to `ValueConfig` with `#[serde(default)]`.
- [ ] `bar_fill_count(fill01, bar_count)` added to
      `render/widgets/gauges/range.rs`; `fill_percentage` and `metric_range`
      are reused unchanged.
- [ ] Shared automatic-geometry helper resolves absent count/gap from live
      logical track span and thickness using the documented constants in each
      runtime, and resolved values are not persisted. Implementation does not
      add or run a cross-runtime parity harness.
- [ ] `ValidatedLinearGaugeWidget` and `ValidatedArcGaugeWidget` gain
      `track_fill_style` and resolved concrete bar geometry. Validators resolve
      a missing style to `Fill`; in bars mode, absent count/gap select auto and
      present values are explicit overrides. Validate explicit
      `bar_count >= 1`, `bar_gap >= 0`, and that the requested count fits the
      available span at `>= 2px` per segment; geometry then clamps the gap. The
      arc validation path covers both `Arc` and `Corner` display types.
- [ ] Linear gauge renderer replaces the continuous track with N discrete
      segments in bars mode. Off segments use the empty-track colour, on
      segments use the fill colour, each segment carries the configured track
      border, and gaps are transparent. `fill` mode is unchanged.
- [ ] Arc gauge renderer replaces the continuous arc with N discrete arc
      segments along the sweep in bars mode, reusing `ArcTrackSpec` geometry.
      Off/on colours and per-segment borders match the linear behaviour, and
      angular gaps are transparent. The same behavior works for corner gauges
      with their existing start angle and sweep. `fill` mode is unchanged.
- [ ] `track_fill_flat` is ignored in bars mode — filled bars always use the
      full `track_corner_radius` on all corners (linear) / caps (arc). The
      `fill`-mode `track_fill_flat` behaviour is unchanged.
- [ ] Static/dynamic split preserved: in bars mode, discrete off segments with
      their borders plus labels are cached in the `SkiaImage`; no continuous
      track is cached behind them, and only filled segment interiors are drawn
      per frame.
- [ ] Existing `fill`-style gauges and `text` widgets render unchanged — zero
      regression.
- [ ] Rust unit tests for `bar_fill_count` (fill01 = 0, immediately below and
      exactly at bucket thresholds, fill01 = 1, fill01 > 1, N = 1, and
      degenerate range) and the bar-sizing / angular-gap clamping formulas,
      including `N == 1`, a requested count that cannot fit, automatic values
      across several linear/arc/corner sizes, and recomputation after resize.

### Frontend

- [ ] `widget-preview/utils/gaugeBarGeometry.js` with `getBarFillCount` and
      `getBarGeometry` pure helpers mirroring the Rust bucket, automatic
      default, sizing, and gap formulas.
- [ ] `LinearGaugeRenderer.jsx` renders discrete bars when
      `data.track_fill_style === 'bars'`: per-segment empty and border shapes
      replace the continuous static-track shape, filled interiors overlay the
      on segments, and the gaps contain no SVG shape (`track_fill_flat`
      ignored).
- [ ] `ArcGaugeRenderer.jsx` renders discrete arc segments in bars mode,
      with per-segment empty/border shapes and filled interiors; no continuous
      arc is rendered behind the transparent gaps. Reuse the existing arc-path
      helpers per bar with per-bar sweep and caps.
- [ ] `LinearDisplaySection.jsx` and `ArcDisplaySection.jsx` expose the
      Fill Style dropdown plus Auto/Custom count and gap controls (hidden
      unless style is `bars`), writing only explicit overrides through
      `useDisplayVariantUpdater`; the arc section writes to the active
      arc/corner variant.
- [ ] `assets/standard-metrics.json`: `track_fill_style` added to `linear`,
      `arc`, and `corner` defaults; `bar_count` and `bar_gap` remain absent so
      they resolve automatically; `"bars"` display-type definition removed.
- [ ] Frontend tests for `gaugeBarGeometry` (bucket count, sizing clamping,
      automatic density, resize recomputation, angular gap) and renderer tests
      asserting bars-mode SVG output for linear, arc, and corner gauges.

### Cleanup and verification gate

- [ ] Full implementation and all intended test cases are written before any
      tests or other verification commands are executed.
- [ ] `/debloat` is applied to every file touched by this issue before tests
      run; its contract, ownership, one-language, pruning, and changed-path
      search checks are completed.
- [ ] No derived Auto count/gap is persisted, no renderer or editor repairs
      malformed required data, and Rust/JS geometry does not develop duplicate
      naming schemes or parallel formulas during implementation.
- [ ] Only after the debloat gate passes, focused tests, formatting, linting,
      type checks, broader relevant suites, and `git diff --check` are run.
- [ ] Any verification-driven fix is debloated before the affected checks are
      rerun.
- [ ] No parity test, parity fixture, golden-image comparison, or manual parity
      check is authored or executed; parity validation is left for the product
      owner after handoff.

## Blocked by

- None — linear (#02) and arc (#04) gauges are already implemented; this slice
  layers on top of them.

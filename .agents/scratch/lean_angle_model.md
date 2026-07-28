# Lean-angle diameter sizing model

## Goal

Replace the `lean_angle` display variant's persisted `width`/`height` sizing with one strict `diameter` field that defines the annular sector's outer diameter.

The selection frame, SVG viewport, Rust render surface, resize aspect ratio, and reported widget bounds must all be derived from the canonical lean-angle geometry. No code path may infer the outer radius from a caller-supplied rectangular frame.

This is a development-only hard cutover:

- Do not change the template format version.
- Do not read or convert the old `width`/`height` lean-angle shape.
- Do not add aliases, fallbacks, compatibility branches, or migration helpers.
- Update all repository-owned defaults, fixtures, and tests directly to the new shape.
- A `lean_angle` variant with missing `diameter`, or with present `width`/`height`, is malformed and must fail at its validation boundary.

This work is strictly a dimensions data-model change. It must not change how the widget is drawn:

- Preserve the existing annular-sector path construction and fill sweep behaviour.
- Preserve the existing inward border geometry, masking/clipping, thickness semantics, colors, opacities, and paint order.
- Preserve the existing track and text shadow filters, blur/offset behaviour, effect padding, opacity composition, and overflow behaviour.
- Preserve the existing value and unit typography, positioning, formatting, and text-border rendering.
- Do not replace the SVG or Skia drawing approach, restructure compositing, or opportunistically fix visual discrepancies between the preview and backend.
- Any before/after visual difference must be attributable only to the new outer diameter and derived logical frame, not to a changed rendering technique.

## Canonical data contract

The durable display variant must have this geometry shape:

```json
{
  "display_variants": {
    "lean_angle": {
      "diameter": 300,
      "track_thickness": 100,
      "track_border_thickness": 0,
      "track_empty_color": "#222222",
      "track_empty_opacity": 0.5,
      "track_filled_color": "#dce2e8",
      "track_filled_opacity": 1,
      "track_border_color": "#ffffff",
      "value_offset_x": 0,
      "value_offset_y": 0,
      "rotation": 0
    }
  }
}
```

`width` and `height` are not part of the durable `lean_angle` contract. They may exist only as named fields on an ephemeral, derived layout object used by rendering and editor interaction code.

The geometric contract is:

```text
outer radius   R = diameter / 2
inner radius   r = R - track_thickness
inner diameter   = diameter - 2 × track_thickness
```

Validation requirements:

```text
diameter > 0
0 < track_thickness < diameter / 2
0 <= track_border_thickness
2 × track_border_thickness < track_thickness
```

The existing border behaviour remains unchanged: the border is drawn inward, and the usable colored track width is:

```text
track_thickness - 2 × track_border_thickness
```

## Derived layout and selection bounds

### Fixed product geometry

Keep these as product constants in the lean-angle geometry modules, not persisted configuration:

```text
start angle  = 210°
sweep angle  = 120°
centre angle = 270°
half sweep   = 60°
maximum fill = 60°
```

For the current upward-facing 120° annular sector, relative to the circle centre:

```text
sector_min_x = -R × sin(60°)
sector_max_x =  R × sin(60°)
sector_min_y = -R
sector_max_y = -r × cos(60°)
```

This produces the exact sector envelope:

```text
sector_width  = 2R × sin(60°)
sector_height = R - r × cos(60°)
```

At `diameter = 300` and `track_thickness = 100`, the sector envelope is approximately `259.81 × 100`.

### Logical label bounds

The value label is centred on the circle centre and must be included vertically in the selection frame. Otherwise the tight sector box would terminate above or through the label.

Use the existing metric line-height contract:

```text
label_line_height = font_size × 0.92
label_min_y = -label_line_height / 2
label_max_y =  label_line_height / 2
```

The stable logical frame is:

```text
frame_min_x = sector_min_x
frame_max_x = sector_max_x
frame_min_y = min(sector_min_y, label_min_y)
frame_max_y = max(sector_max_y, label_max_y)

frame_width  = frame_max_x - frame_min_x
frame_height = frame_max_y - frame_min_y

center_x = -frame_min_x
center_y = -frame_min_y
```

For `diameter = 300`, `track_thickness = 100`, and `font_size = 60`, the derived frame is approximately `259.81 × 177.6`.

Selection bounds must remain stable during playback:

- Do not measure the current telemetry string to determine the frame.
- Do not include text shadow, track shadow, text border, or antialias padding.
- Do not expand the frame for `value_offset_x` or `value_offset_y`; offsets intentionally allow content to overflow the logical frame.
- Do not add a frame margin that changes the meaning of `diameter`.

Rendering code may allocate additional transparent surface padding for raster effects. That padding is not part of the logical frame, selection frame, persisted position, or geometry report.

### Position semantics

`x` and `y` remain the top-left corner of the derived logical frame.

The circle centre in scene coordinates is:

```text
scene_center_x = x + center_x
scene_center_y = y + center_y
```

No centre-preservation migration is needed because all repository data and tests will be changed directly to the new development contract.

## Implementation plan

### 1. Change the shared manifest contract

Update `assets/standard-metrics.json`:

- Remove `defaultFrameWidth` and `defaultFrameHeight` from `displayTypes.definitions.lean_angle`.
- Add `diameter` to `lean_angle.defaults`.
- Use `300` as the new default diameter.
- Keep `track_thickness: 100`.
- Keep shared typography fields at the value-widget level; do not duplicate them into the variant.
- If the manifest needs to identify derived framed widgets, add one explicit declarative field such as `"frameSizing": "derived"`. Do not encode derived width and height as defaults.

Update the manifest readers:

- `layoutMode: "boxed"` must continue to mean that the widget has a fixed editor frame and uses resize handles.
- A boxed display type must no longer be assumed to always have `defaultFrameWidth` and `defaultFrameHeight`.
- `getDefaultFrameDimensions('lean_angle')` must not manufacture or return stored frame defaults. Lean-angle layout must be resolved from its complete active data.
- Keep explicit-frame behaviour unchanged for `heading_tape`, `linear`, `arc`, and `corner`.

Update manifest/catalog tests so they assert:

- Lean-angle defaults contain `diameter`.
- Lean-angle has no `defaultFrameWidth` or `defaultFrameHeight`.
- Lean-angle remains boxed.
- Its durable variant key set admits `diameter` and does not admit `width` or `height`.

### 2. Introduce one frontend lean-angle layout utility

Refactor `app/src/features/widget-preview/widgets/lean-angle/geometry.js` so it owns all lean-angle layout math.

Add a pure exported function with a contract equivalent to:

```js
getLeanAngleLayout({
  diameter,
  track_thickness,
  font_size,
})
```

Return at least:

```js
{
  width,
  height,
  minX,
  minY,
  maxX,
  maxY,
  centerX,
  centerY,
  outerRadius,
  innerRadius,
  startAngle,
  sweepAngle,
}
```

Responsibilities:

- Calculate `outerRadius` directly from `diameter`.
- Calculate `innerRadius` directly from `track_thickness`.
- Calculate the sector envelope analytically.
- Union the sector's vertical bounds with the stable label line box.
- Translate the circle centre into the derived local frame.
- Throw on malformed geometry instead of clamping or repairing it.

Remove:

- `FRAME_MARGIN`.
- `getLeanAngleOuterRadius(width, height)`.
- Any `Math.min` radius fitting against a rectangular frame.
- Any lean-angle-specific width/height ratio.

Keep the path-building functions consuming the returned geometry. They should not recalculate size or validate fields already validated by the layout function.

### 3. Resolve derived frame geometry once in the frontend

Give active widget resolution one owner for derived frame geometry.

In `app/src/lib/widget/widget-resolver.js`:

- When resolving the active `lean_angle` variant, merge the shared and variant fields first.
- Call `getLeanAngleLayout` once with the resolved diameter, track thickness, and shared font size.
- Add the returned `width` and `height` to the ephemeral resolved object used by the editor and preview.
- Do not add derived `width`/`height` to `display_variants.lean_angle`.
- Do not add them to the durable top-level value widget.

Avoid a reverse dependency from general widget code into a React component module. If necessary, move the pure lean-angle geometry/layout functions to a neutral location such as:

```text
app/src/lib/widget/lean-angle-geometry.js
```

The preview, resolver, editor controls, and resize code must import the same pure utility rather than maintaining mirrored frontend formulas.

Update `initDisplayVariant` and `resetCurrentDisplayConfig`:

- Initialize/reset `diameter` from the manifest.
- Do not seed lean-angle `width` or `height`.
- Preserve the current rule that shared font fields remain top-level.

Update durable normalization:

- Derive allowed lean-angle variant keys without the global `width`/`height` frame keys.
- Do not silently retain old lean-angle frame fields.
- If there is a frontend schema/assertion boundary, explicitly reject present `width` or `height` for `lean_angle`.

### 4. Render the JSX preview from the derived layout

Update:

```text
app/src/features/widget-preview/widgets/lean-angle/LeanAnglePreview.jsx
app/src/features/widget-preview/widgets/lean-angle/useLeanAnglePreview.js
```

The preview hook should obtain the layout from the canonical frontend utility and use it for:

- SVG `width`.
- SVG `height`.
- SVG `viewBox`.
- Circle centre.
- Track paths.
- Fill paths.
- Label origin.

The component must no longer read `widget.data.width` or `widget.data.height`.

Keep the existing SVG element structure and drawing behaviour intact. The change in this component is limited to supplying diameter-derived viewport dimensions and geometry coordinates; border masks, clip paths, shadow filters, element order, colors, opacities, and text rendering must not be redesigned.

The global scene scale remains a rendering concern:

```text
SVG CSS width  = layout.width × globalScale
SVG CSS height = layout.height × globalScale
viewBox        = unscaled derived layout
```

Do not make the hook or component infer missing `diameter` from old geometry.

### 5. Make editor selection use the derived frame

The overlay editor already sizes framed widget DOM nodes from resolved widget data. Preserve that flow, but ensure the lean-angle resolver supplies derived dimensions.

Verify/update:

```text
app/src/features/overlay-editor/utils/widgetRenderGeometry.js
app/src/features/overlay-editor/components/OverlayCanvas.jsx
```

Expected behaviour:

- The widget DOM node uses derived `width` and `height`.
- Moveable therefore selects the logical sector-plus-label frame.
- The frame has no large empty lower region.
- Changes to diameter, thickness, or font size trigger `updateRect()`.
- Playback changes do not change the frame.
- Shadows and offsets may overflow without changing selection geometry.

Do not route lean-angle through intrinsic `visualBounds`; it remains a boxed widget with a derived frame.

### 6. Replace the lean-angle resize policy

Refactor `app/src/features/overlay-editor/utils/widgetResizeScaling.js`.

Remove:

- `LEAN_ANGLE_FRAME_HEIGHT_RATIO`.
- `lockResizeFrame`'s lean-angle ratio branch.
- The rule that calculates lean-angle scale from persisted frame width.
- Lean-angle writes through `buildFrameGeometryUpdate`.

At resize start, capture:

```text
original derived frame width
original derived frame height
original diameter
original scalable style fields
```

For a uniform corner resize:

```text
scale_factor = requested_width / original_derived_width
new_diameter = original_diameter × scale_factor
```

Scale these fields by the same factor:

- `diameter`
- `track_thickness`
- `track_border_thickness`
- shared `font_size`
- `value_offset_x`
- `value_offset_y`

After scaling, derive the next frame from the updated content. Because diameter, thickness, font size, and offsets scale uniformly, the non-offset logical bounds are homogeneous and preserve their aspect ratio.

Resize drafts and commits may carry ephemeral derived width/height for immediate DOM updates, but the commit patch must contain only:

- Updated `x`/`y`.
- Updated shared scalable fields.
- Updated canonical lean-angle variant fields.

It must not persist derived frame dimensions.

Retain the existing numeric limits where they represent editor UX, but validate limits against the new diameter:

- `track_thickness` maximum must be strictly less than `diameter / 2`.
- `track_border_thickness` maximum must leave positive usable track width.
- Remove the old hard cap of `100` on scaled track thickness if it prevents valid scaling of larger widgets. UI slider ranges and data-contract validation are separate concerns.

Update `buildUniformResizeUpdate` so the Size/Diameter editor interaction targets diameter rather than frame width.

### 7. Update the lean-angle editor controls

Refactor `app/src/features/widget-editor/components/metricWidget/LeanAngleDisplaySection.jsx`:

- Rename the control label from `Size` to `Diameter`.
- Bind it to `leanVariant.diameter`.
- Remove reads of `leanVariant.width`, `leanVariant.height`, and top-level width.
- Calculate thickness limits from `diameter / 2`.
- On diameter changes, use the lean-angle uniform scale policy so the current proportional-resize behaviour remains consistent with drag resizing.
- Keep the separate Thickness and Border controls for deliberate restyling after resizing.

The control must not calculate a target frame width or write any frame dimensions.

### 8. Change the Rust raw and validated contracts

`ValueConfig` already contains a `diameter` field for G-force. Reuse the canonical raw field; do not add a lean-angle alias.

Refactor `src-tauri/ovrley_core/src/normalize/lean_angle.rs`:

- Replace `width` and `height` in `ValidatedLeanAngleWidget` with `diameter`.
- Require a positive finite diameter.
- Reject present `width` or `height` for a `lean_angle` value.
- Validate thickness and border thickness against the diameter.
- Remove `FRAME_MARGIN`.
- Remove `lean_angle_outer_radius(width, height)`.
- Keep validation at ingress so render consumers can trust all fields.

Be careful with promoted display variants:

- `display_variants.lean_angle.diameter` must promote into `ValueConfig.diameter`.
- Old nested `width`/`height` must not be accepted.
- The general promotion mechanism must not turn malformed old geometry into a valid lean-angle config.

If `ValueConfig.width` and `height` remain necessary for other display types, the lean-angle validator must explicitly require both to be absent rather than ignoring them.

### 9. Introduce the canonical Rust lean-angle layout

Create one Rust layout function, colocated with lean-angle normalization or in a small geometry module shared by validation and rendering.

It should accept already validated:

```rust
diameter: f32,
track_thickness: f32,
font_size: f32,
```

and return:

```rust
pub struct LeanAngleLayout {
    pub width: f32,
    pub height: f32,
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
    pub center_x: f32,
    pub center_y: f32,
    pub outer_radius: f32,
    pub inner_radius: f32,
}
```

Use the same constants and equations as the frontend utility.

Do not repeat validation, finite checks, clamping, or fallback calculations in the renderer.

### 10. Render the Rust widget from diameter-derived geometry

Refactor `src-tauri/ovrley_core/src/render/widgets/lean_angle/mod.rs`:

- Replace `lean_angle_geometry(width, height, thickness)` with geometry built from `LeanAngleLayout`.
- Scale the canonical inputs by `scene.scale`, then derive the scaled layout.
- Calculate raster surface dimensions from the derived layout.
- Use the derived `center_x` and `center_y`.
- Keep static effect padding separate from logical frame dimensions.
- Position the cached static image at `widget.x - padding`, `widget.y - padding`.
- Draw dynamic fill and text relative to the derived scene centre.
- Report the derived logical frame in `WidgetGeometryReport`.

The existing Skia rendering approach must otherwise remain unchanged. Reuse the current annular-sector paths, inward border contour, clear/mask operations, shadow filter construction, effect padding, paint configuration, draw order, clipping, fill sweep, and text drawing. Do not turn this sizing refactor into a border, shadow, path, or compositing rewrite.

The cache may retain derived integer surface width and height for image allocation/reporting, but they are outputs of the layout calculation rather than normalized widget fields.

Use a consistent rounding policy:

- Keep layout calculations in `f32`.
- Round up raster allocation dimensions when necessary to avoid clipping.
- Keep logical bbox values based on the unrounded derived geometry where the report supports floats.
- If `widget_width`/`widget_height` require integers, document and test the exact rounding rule.

Do not restore a hidden margin by shrinking the radius inside the allocated surface. The requested diameter is the outer diameter.

### 11. Update repository-owned data directly

Search all tracked JSON, JS, JSX, and Rust fixtures for lean-angle variant geometry.

For every development fixture:

- Remove lean-angle `width`.
- Remove lean-angle `height`.
- Add the intended `diameter`.
- Update expected `x`/`y` only where a fixture asserts a particular rendered position under the new logical frame.
- Update expected frame dimensions to the analytically derived bounds.

Do not preserve old fixture geometry through conversion code. Choose explicit canonical values that make each test's intent clear.

This includes, at minimum:

```text
assets/standard-metrics.json
app/src/tests/features/standard-metrics/standardMetricCatalog.test.js
app/src/tests/features/template-manager/templateSnapshot.test.js
app/src/tests/features/widget-editor/MetricWidgetEditor.test.jsx
app/src/tests/features/widget-preview/LeanAngleRenderer.test.jsx
app/src/tests/features/widget-preview/WidgetPreview-dispatch.test.jsx
app/src/tests/features/overlay-editor/widgetResizeScaling.test.js
app/src/tests/features/overlay-editor/OverlayEditor.selection.test.jsx
src-tauri/ovrley_core/src/render/widgets/tests/lean_angle_geometry_tests.rs
```

Run a repository-wide search after implementation. No lean-angle fixture or production branch should still pair the display type with width/height-based geometry.

### 12. Frontend tests

Modify the existing lean-angle tests and fixtures rather than creating a broad new test matrix.

Required changes:

1. Update the existing catalog, template snapshot, editor, preview, selection, and resize fixtures to use `diameter` and remove lean-angle `width`/`height`.
2. Replace the existing geometry expectation with one representative default-layout assertion covering:
   - `outerRadius === diameter / 2`
   - `innerRadius === outerRadius - track_thickness`
   - the expected derived frame width and height
3. Update the existing preview test to assert that the SVG viewport uses the derived frame.
4. Update the existing resize test to assert that a uniform resize scales `diameter` and the existing dependent style fields, and that the committed variant contains no `width` or `height`.

Add a new frontend test only if the existing suites cannot naturally cover a crucial contract. The only justified addition is a focused malformed-geometry test proving that an invalid diameter/thickness relationship fails rather than being repaired.

### 13. Rust tests

Modify the existing lean-angle geometry and normalization tests in place.

Required changes:

1. Convert the current width/height geometry fixture to `diameter`.
2. Keep one geometry test that proves the outer radius, inner radius, and derived logical frame for a representative configuration.
3. Adapt the existing track-width/border test to the diameter model.
4. Adapt an existing normalization test, or add one small test if none exists, to prove that missing or invalid `diameter` is rejected.

Do not add separate tests for every intermediate bound, render padding, scaling field, or frontend/Rust parity case. The shared equations should be covered through the representative geometry assertion and the existing renderer behaviour tests.

### 14. Verification

Run without invoking a production build:

```text
pnpm lint
cd app && npx vitest run
cargo test --manifest-path src-tauri/ovrley_core/Cargo.toml
```

Do not run `pnpm build`, `pnpm tauri build`, or the build wrapper without explicit user permission.

Perform a final repository search for:

```text
LEAN_ANGLE_FRAME_HEIGHT_RATIO
getLeanAngleOuterRadius
lean_angle_outer_radius
lean_angle_geometry(
```

Also inspect all `display_type: 'lean_angle'` and `"display_type": "lean_angle"` fixtures to confirm that none still use width/height sizing.

## Recommended implementation order

1. Update the manifest and canonical durable key lists.
2. Implement and test the pure frontend layout utility.
3. Update frontend resolution and preview rendering.
4. Replace editor resize and Diameter control behaviour.
5. Update frontend fixtures and selection tests.
6. Update Rust validation and introduce the Rust layout function.
7. Update Rust rendering/cache/report geometry.
8. Replace Rust fixtures and geometry tests.
9. Run lint and targeted frontend/Rust tests.
10. Run the full frontend and core Rust test suites.
11. Perform the final stale-contract search.

## Acceptance criteria

- `diameter` is the only persisted outer-size field for `lean_angle`.
- Inner diameter is always `diameter - 2 × track_thickness`.
- No lean-angle consumer derives radius by fitting into width/height.
- No hard-coded lean-angle frame aspect ratio remains.
- JSX and Rust use equivalent analytical layout equations.
- The editor selection frame includes the sector and normal centred label without the old blank lower area.
- Resize handles and the Diameter editor write the same canonical geometry shape.
- Durable lean-angle updates never contain width or height.
- Old lean-angle width/height data fails loudly; it is not converted or repaired.
- Border and shadow construction, rendering, compositing, and visual styling are unchanged.
- Preview and backend path construction, paint order, clipping/masking, and text rendering are unchanged apart from receiving diameter-derived coordinates.
- All repository defaults and fixtures use the new shape directly.
- Frontend lint/tests and `ovrley_core` tests pass.
- No production build is run as part of the implementation or verification.

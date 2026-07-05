# PRD: Backdrop Widgets

## Problem Statement

Cyclemetry overlays let users compose telemetry widgets (text metrics, gauges, route maps, elevation plots, text labels) onto drone/cycle video. There is no way to add simple geometric elements behind widgets — visual backdrops that group, frame, or separate regions of the overlay. Users who want a colored panel behind a cluster of metrics, a circle framing the route map, or a rounded rectangle separating the time readout from the gradient indicator have no first-class way to achieve it; they resort to working around the absence with ad hoc label backgrounds or nothing at all.

The frontend and Rust backend share widget metadata through JSON manifests, but `standard-widgets.json` — which carries defaults for plot/gradient/label widgets — is loaded only by the frontend today, so any new widget category added there cannot be a shared contract with the backend. Adding backdrops as a new widget category therefore also requires establishing the shared-loader pattern for `standard-widgets.json`, mirroring how `standard-metrics.json` is already shared via `include_str!` on the Rust side.

## Solution

Add a new widget category — **backdrops** — consisting of simple geometric elements (circle and rectangle) that render behind all other widgets as visual backdrops. Backdrops are pure-static: they have no per-frame telemetry interpolation, so they join the existing static cache alongside labels and icons, drawn as the first (lowest) layer within the static image.

The `display_type` concept (familiar from metric widgets, which can be `text`/`linear`/`heading_tape`/etc.) is reused: a backdrop has a `display_type` of `circle` or `rectangle`, with shape-specific geometry fields and shared styling fields (fill, border, opacity). The available display types and their defaults live in a shared manifest so frontend and backend derive the same schema.

Circle backdrops have a `diameter`, fill color/opacity, border thickness/color/opacity. Rectangle backdrops have `width`, `height`, fill color/opacity, border thickness/color/opacity, `corner_radius`, and per-corner rounding toggles (top-left, top-right, bottom-left, bottom-right) so any combination of rounded corners is possible. The configured dimension is the total (nominal, border-outer inclusive) size; the border is drawn outside the fill with no overlap and no gap.

Backdrops always render below all other widgets (lowest z-index) in both the Rust backend (drawn first in the static cache, before labels and icons) and the frontend (z-index assigned per widget category on the moveable wrapper).

## User Stories

1. As an overlay editor, I want to add a backdrop widget from the "Add Widget" drawer, so that I can place a geometric element behind my other widgets.
2. As an overlay editor, I want the backdrop drawer entry to default to a rectangle, so that I get the most commonly useful shape with one click.
3. As an overlay editor, I want to switch a backdrop between circle and rectangle via a display-type dropdown in the editor, so that I can change the shape without deleting and re-adding the widget.
4. As an overlay editor, I want switching display type to preserve my shared styling (fill, border, opacity, position) and remember each shape's previous geometry when I switch back, so that experimenting with shapes is non-destructive.
5. As an overlay editor, I want to position a backdrop by dragging it on the canvas, so that I can place it behind the widgets it frames.
6. As an overlay editor, I want `x` and `y` to refer to the top-left of the backdrop's bounding box for both circle and rectangle, so that positioning behaves consistently across all widget types.
7. As an overlay editor, I want to set a circle's `diameter` to define its total visual size, so that what I configure is what I see.
8. As an overlay editor, I want to set a rectangle's `width` and `height` to define its total visual size, so that what I configure is what I see.
9. As an overlay editor, I want to set a fill color and fill opacity independently for each backdrop, so that I can create subtle tinted regions or solid panels.
10. As an overlay editor, I want to set a border thickness, border color, and border opacity independently, so that I can outline a backdrop without filling it.
11. As an overlay editor, I want a border thickness of `0` to disable the border, so that the backdrop is fill-only.
12. As an overlay editor, I want the border to be drawn outside the fill with no overlap and no gap, so that the configured dimension exactly matches the backdrop's total visual size and the fill is fully visible behind the border.
13. As an overlay editor, I want a rectangle's `corner_radius` to round its corners, so that I can create soft rounded panels.
14. As an overlay editor, I want per-corner rounding toggles (top-left, top-right, bottom-left, bottom-right) so that I can round any combination of corners.
15. As an overlay editor, I want the per-corner rounding control to be a 2×2 visual grid of clickable corner regions, so that I can see and toggle the rounded corners spatially without reading four labels.
16. As an overlay editor, I want the corner-radius slider to sit beside the 2×2 grid so that the editor makes efficient use of vertical space.
17. As an overlay editor, I want backdrops to always render behind labels, metric values, and plots, so that they never obscure content.
18. As an overlay editor, I want backdrops listed first in the widget sidebar, so that the sidebar order matches the visual stacking order.
19. As an overlay editor, I want to select and manipulate a backdrop with the moveable handle even though it sits below other widgets, so that backdrops are first-class interactive widgets.
20. As an overlay editor, I want a backdrop's top-level `opacity` to fade the entire backdrop (fill and border together), so that I can globally fade a backdrop while keeping per-element fill/border opacities.
21. As an overlay editor, I want backdrops included in video renders exactly as they appear in the editor preview, so that there is no preview/render divergence.
22. As an overlay editor, I want an invalid color value (non-hex string) to be rejected with a clear error naming the field and backdrop index, so that I can fix typos instead of getting silent fallback colors.
23. As an overlay editor, I want out-of-range opacity values (e.g. `1.5`, `-0.2`) to be rejected, so that bad config is caught rather than silently clamped.
24. As an overlay editor, I want a `border_thickness` that exceeds half the smaller dimension to be rejected, so that a malformed backdrop cannot enter the render pipeline.
25. As a template author, I want existing templates (without a `backdrops` section) to load unchanged, so that upgrading the app does not break my saved overlays.
26. As a template author, I want backdrops stored as a top-level `backdrops: []` array in the template file, so that the template format stays parallel to `labels` and `values`.
27. As a maintainer, I want the `standard-widgets.json` manifest restructured to a uniform `definitions` shape per section, so that all widget categories share a consistent contract and the file can be loaded by both frontend and Rust.
28. As a maintainer, I want the Rust backend to load `standard-widgets.json` via `include_str!` + `OnceLock`, mirroring `standard-metrics.json`, so that the frontend and backend share a single source of truth for widget defaults.
29. As a maintainer, I want the `BackdropType` enum to be deserialized strictly (no fallback for unknown values), so that invalid display types are caught at the serde layer with a precise error.
30. As a maintainer, I want the `display_type` and its `defaults` to be manifest-derived on both sides (no hand-maintained Rust mirror of property lists), so that adding future backdrop types only requires extending the manifest and the `BackdropType` enum variants.
31. As a maintainer, I want the backdrop validator to reject any missing styling field (no backend defaults for styling), so that the no-backend-defaults invariant is honored.
32. As a maintainer, I want the only silent clamps to be `corner_radius` to `min(width,height)/2` (crash-prevention, mirroring the linear gauge) and `corner_radius` to `border_thickness` for rounded corners when `T > R` (UX reasonability), so that users are not blocked by a minor geometric technicality but styling intent is never silently overridden.
33. As a maintainer, I want the singular hand-maintained Rust mirror to be the `BackdropType` enum (Circle/Rectangle), exactly as `DisplayType` is the only mirror for metrics, so that the cost of adding a display type is one enum variant plus its render branch.
34. As a maintainer, I want the backdrop draw code isolated in its own module under `render/widgets/`, re-exported and called from the static layer, so that widget-type-specific geometry lives with the other widgets rather than in the static-layer module.
35. As a maintainer, I want the backdrop renderer integrated into the shared static cache (single `OnceLock<Mutex<HashMap<u64, Image>>>` table, expanded cache key), so that adding a new static element category reuses the established caching mechanism.

## Implementation Decisions

### Manifest restructure

`assets/standard-widgets.json` is restructured so every section uses the shape `{ definitions: { <key>: { label, defaults } }, [defaults] }`. The existing sections (`plot`, `gradient`, `label`) migrate to this shape; a new `backdrops` section carries `defaults: ["rectangle"]` (the default display_type list, parallel to `displayTypes.defaults` in `standard-metrics.json`) plus `definitions` for `circle` and `rectangle`.

Each definition's `defaults` embeds `display_type` (mirroring `standard-metrics.json`'s `displayTypes.definitions.text.defaults.display_type: "text"`). Every definition carries a `label` for uniform shape.

Only `backdrops` has a top-level `defaults` list; the other sections have a single definition each, so `defaults` is omitted there.

Backdrop `defaults` use `0-1` float opacity scales (matching the linear gauge and the top-level `opacity` field, not the legacy `0-100` plot opacity fields).

### Rust shared-manifest loader

A new `standard_widgets` module mirrors `standard_metrics`:
- `static STANDARD_WIDGET_MANIFEST: OnceLock<StandardWidgetManifest>` + `load_manifest()` using `include_str!(concat!(CARGO_MANIFEST_DIR, "/../../assets/standard-widgets.json"))`.
- Raw serde structs (`#[serde(rename_all = "camelCase")]`) for the manifest shape.
- Accessor helpers parallel to `display_type_definition`, `display_type_label`.
- Re-exported from the crate root.

The property-list schema is parsed as data (no Rust mirror of the property field names). The only hand-maintained Rust mirror is the `BackdropType` enum (the same trade-off `DisplayType` already makes for metrics).

### `BackdropType` enum

Two variants `Circle` and `Rectangle`, `#[serde(rename_all = "lowercase")]`. `Default` is `Rectangle` (matching the manifest default). **Strict Deserialize** — unknown/null `display_type` produces a serde error rather than falling back. (Unlike `DisplayType`, which falls back to `Text` for legacy-template compat, backdrops have no legacy and the no-backend-defaults invariant is honored.) `as_str()` returns the manifest key.

### Raw config shape (`BackdropConfig`)

Mirrors `ValueConfig`'s hybrid storage: shared fields at top level typed as `Option<T>` (the validator enforces presence, not serde), `display_type: BackdropType` (strict), `display_variants: BTreeMap<String, serde_json::Value>` (raw; the validator promotes per-type geometry fields).

Shared top-level fields: `id`, `x`, `y`, `opacity`, `fill_color`, `fill_opacity`, `border_thickness`, `border_color`, `border_opacity`. Geometry fields (`diameter` for circle; `width`, `height`, `corner_radius`, `round_top_left`, `round_top_right`, `round_bottom_left`, `round_bottom_right` for rectangle) live under `display_variants.<type>`.

**No `rotation` field** — backdrops cannot be rotated.

### Validator (`validate_backdrop` → `ValidatedBackdrop`)

Flat `ValidatedBackdrop` struct mirroring `ValidatedValueWidget`: carries all circle+rectangle fields with `display_type` as discriminator; unused fields for the inactive type are zero-initialized. The validator dispatches on `display_type` to require the right subset of variant fields (circle requires `diameter`; rectangle requires `width`, `height`, `corner_radius`, `round_*_*`).

Validation rules:

- `id`: required string; reject missing/empty.
- `display_type`: strict enum; reject unknown (serde layer).
- `x`, `y`: required finite `f32`; reject non-finite.
- `opacity`, `fill_opacity`, `border_opacity`: required in `[0.0, 1.0]`; reject out-of-range (mirror `label.rs` and `linear_gauge.rs`).
- `diameter` (circle), `width`/`height` (rectangle): required `> 0`; reject `<= 0` (mirror `linear_gauge.rs:87-92`).
- `border_thickness`: required `>= 0`; reject negative; `0` is valid and disables the border.
- `2 * border_thickness < min(width, height)` (rect) / `2 * border_thickness < diameter` (circle): reject if violated (border ring must fit within the nominal dimensions).
- `corner_radius`: required `>= 0`; reject negative; **crash-prevention clamp** to `min(width, height) / 2` (mirror `linear_gauge.rs:138`).
- `corner_radius` vs `border_thickness` for rounded corners: **silent clamp** of `corner_radius` down to `border_thickness` when `T > R` and the corner is rounded (`round_*_* = true`). Sharp corners (boolean `false`) are unaffected. This is a UX reasonability clamp, not a styling-intent clamp.
- `round_top_left`, `round_top_right`, `round_bottom_left`, `round_bottom_right`: required bool; reject missing.
- `fill_color`, `border_color`: required hex strings (`#rrggbb` or `#rrggbbaa`); reject if invalid (use the `require_hex_color` helper).

### Alpha composition

Final fill alpha = `fill_color.hex_alpha * fill_opacity * opacity`. Final border alpha = `border_color.hex_alpha * border_opacity * opacity`. The top-level `opacity` is a multiplier that stacks multiplicatively with `fill_opacity` and `border_opacity`, mirroring how the linear gauge combines widget-level opacity with track-level opacities.

### Validator dispatch

A new `backdrops` iteration loop in `validate_render_config` (parallel to the `labels` loop) produces `Vec<ValidatedBackdrop>`. A new `backdrops: Vec<ValidatedBackdrop>` field on `ValidatedRenderConfig`.

### Geometry — dimension semantics

Configured dimension = total (nominal visual size), border-outer edge inclusive. Border drawn outside the fill: no overlap, no gap. Fill is inset by `thickness` on each side.

**Circle:**
- `x, y` = top-left of the nominal `diameter × diameter` bounding box.
- Fill path radius = `diameter / 2 - thickness`.
- Stroke path radius = `(diameter - thickness) / 2`, stroke width = `thickness`.
- Total visual diameter = `diameter`.

**Rectangle:**
- `x, y` = top-left of the nominal `width × height` bounding box.
- Fill path = rounded-rect inset by `thickness`, radius `max(0, corner_radius - thickness)` per gated corner.
- Stroke path = rounded-rect inset by `thickness / 2`, stroke width `thickness`, radius `corner_radius` per gated corner.
- `corner_radius` applies only to corners where the corresponding `round_*_*` boolean is `true`; corners with `false` are sharp on all three paths (nominal, stroke, fill) consistently.
- Total visual size = `width × height`.

### Render module (`render/widgets/backdrop`)

A single file (no subdirectory; backdrops need no `prepare_*_cache`, `frame_state`, or `simplify` like route/elevation do). Exposes `draw_backdrop` (dispatches on `display_type` to circle or rectangle drawing) and `draw_backdrops_static_layer` (iterates all backdrops in array order). Re-exported via `render/widgets/mod.rs`.

### Static cache integration

Extend the shared `cached_labels_image` (and `prepare_base_rgba` for the video path) to bake backdrops into the **same** static image. **Draw order within the static image: backdrops first → labels → icons** so backdrops paint at the bottom of the static stack. The cache key hash is expanded to include `backdrops` so changing backdrops invalidates the cached image. Single shared `OnceLock<Mutex<HashMap<u64, Image>>>` table — no separate backdrop cache; within a render job the cache is built once and blitted across frames.

### Template integration

New top-level `backdrops: []` array in the template file, parallel to `labels`/`values`. `#[serde(default)]` empty `Vec` on the Rust raw config so existing templates load with zero backdrops, no migration. The frontend treats missing `backdrops` as `[]`.

### Frontend manifest exports

`app/src/lib/widget/standard-widgets.js` walks `*.definitions.*.defaults` to derive the existing `COURSE_PLOT_DEFAULTS`/`ELEVATION_PLOT_DEFAULTS`/`GRADIENT_DEFAULTS`/`TEXT_LABEL_DEFAULTS`. New backdrop exports mirror the metric pattern: `BACKDROP_TYPE_DEFINITIONS`, `BACKDROP_TYPE_LABELS`, `BACKDROP_DEFAULT_DISPLAY_TYPES`, `BACKDROP_CIRCLE_DEFAULTS`, `BACKDROP_RECTANGLE_DEFAULTS`. A `getBackdropTypeOptions()` helper (parallel to `getDisplayTypeOptions`) is sourced from `BACKDROP_TYPE_DEFINITIONS`.

### Key whitelists

Per-type whitelists mirroring `VALUE_SHARED_KEYS` + `DISPLAY_VARIANT_KEYS`:
- `BACKDROP_SHARED_KEYS = ['id', 'x', 'y', 'opacity', 'display_type', 'fill_color', 'fill_opacity', 'border_thickness', 'border_color', 'border_opacity']`
- `BACKDROP_CIRCLE_KEYS = ['diameter']`
- `BACKDROP_RECTANGLE_KEYS = ['width', 'height', 'corner_radius', 'round_top_left', 'round_top_right', 'round_bottom_left', 'round_bottom_right']`

Used during template normalization to strip unknown keys per `display_type`.

### Widget flattening and ordering

`buildConfigWidgets` emits the `backdrops` array **first** in the flattened list: `backdrops → labels → values → plots`. The sidebar iterates this list, so backdrops appear at the top of the sidebar accordion, consistent with draw order.

### Z-index (frontend)

The z-policy lives on the moveable wrapper div (the wrapper's `transform` establishes a stacking context that traps inner z-index, so z-class inside the renderer cannot escape to reorder across widgets). Extend the per-category z-class line in `OverlayCanvas`:

- `backdrops` → `z-1`
- `labels` → `z-2`
- `plots` → `z-2`
- `values` → `z-10` (unchanged)

Tailwind v4 supports bare `z-1`/`z-2`. No negative z-index (avoids escaping the parent stacking context). Visual order (bottom→top): backdrops → labels (DOM-first at z-2) → plots (DOM-after at z-2) → values (z-10). All existing ordering constraints preserved (values selectable above plots; plots above labels; labels above canvas background).

### Renderer (`BackdropRenderer`)

A single file, internal dispatch on `display_type`: `circle` → SVG `<circle>`; `rectangle` → SVG `<rect>` with per-corner-radius work via SVG paths (asymmetric rounding is not expressible with `<rect rx>`). Memoized with the same comparator pattern as other renderers. Registered in the `WidgetPreview` dispatch hub as a `widget.type === 'backdrop'` branch.

### Drawer entry

Single "Backdrop" drawer entry defaulting to `rectangle`. The drawer pulls from `QUICKMENU_ITEMS` in `widget-icons.jsx`; the new entry slots at the end of the `general` group, before the metric types. `TYPE_LABELS` adds `backdrop: 'Backdrop'`; `WIDGET_DRAWER_LABELS` adds `backdrop: 'Backdrop'`. The icon is `Presentation` from `lucide-react`. `NON_METRIC_CATEGORIES` adds `backdrop: 'general'`.

### Add-backdrop routine

Mirrors the metric-widget add flow:
- Read default display_type from the manifest (`backdrops.defaults[0]` → `'rectangle'`).
- Seed shared fields from the active type's defaults (`BACKDROP_RECTANGLE_DEFAULTS`, mirroring how metrics read `TEXT_DEFAULTS`): `id` (uuid), `x`, `y`, `opacity`, fill/border fields, `display_type`.
- Call `initBackdropVariant(seed, 'rectangle')` to pre-seed `display_variants.rectangle` with the rectangle geometry defaults upfront so the renderer reads valid geometry immediately (unlike text metrics, rectangle has 7 variant fields the user interacts with from the start).
- `circle` is absent from `display_variants` initially and seeded lazily when the user first switches.

### Display-type swap

A new `backdrop-widget-resolver` module parallels `metric-widget-resolver`. `initBackdropVariant(widgetData, displayType)` is **non-destructive**: it preserves existing `display_variants[<other types>]` and seeds `display_variants[displayType]` from `BACKDROP_<TYPE>_DEFAULTS` only if absent. `resolveActiveBackdropData(widgetData)` flattens shared top-level fields with the active `display_variants[display_type]` for the renderer. The editor's display-type dropdown calls `initBackdropVariant` on change, then commits `{ display_type, display_variants }` — the exact mirror of `MetricWidgetEditor`'s swap flow.

### Editor (`BackdropWidgetEditor`)

A single file (no subdirectory; backdrops have only ~13 fields max and ~7 shared between shapes). Inline circle/rectangle sections rather than separate section files. Layout:

- **Display Type** dropdown populated by `getBackdropTypeOptions()`.
- **Shared section** (color pickers, opacity sliders, border): `fill_color`, `fill_opacity`, `border_thickness`, `border_color`, `border_opacity`, top-level `opacity`.
- **Shape-specific section** rendered conditionally on `display_type`:
  - **Circle:** `diameter` numeric input.
  - **Rectangle:** a 2-column CSS grid layout. Column 1 spans 2 rows and contains a **2×2 visual corner grid** — a small SVG rectangle with four clickable corner regions; each toggles `round_*_*`. Active corners render curved at the current `corner_radius`; inactive render sharp. Filled/highlighted background when active. Column 2 stacks `corner_radius` slider, `width` and `height` numeric inputs beside the grid.

Reuses shared control infrastructure (`widgetFormControls`, `widgetEditorSections`, `PositionSection`).

### Sidebar editor dispatch

`backdrop: BackdropWidgetEditor` is added to the `WIDGET_EDITOR_MAP` dispatch map in `SidebarWidgetsTab`. The existing dispatch in `renderWidgetEditor` handles it via the map.

## Testing Decisions

### What makes a good test

Tests exercise external behavior (input → observable output/error), not implementation details. Invalid input produces a precise, field-named error a user could act on; valid input produces a validated struct with the expected fields. Renderers are tested via their observable drawing output (or, where snapshot infra exists, snapshot matching).

### Modules to be tested

1. **Rust manifest loader (`standard_widgets`)** — assert the parsed definitions match the manifest's expected keys and defaults. Prior art: behavior of `standard_metrics`'s parsed `OnceLock` cache accessed via the accessor helpers.
2. **Rust validator (`normalize/backdrop`)** — exhaustive rejection and clamp tests: missing `id`/`opacity`/`colors`; out-of-range opacity; zero/negative dimensions; `2*thickness > dimension` rejected; `corner_radius` crash-clamp to `min(w,h)/2`; `corner_radius` silent clamp to `border_thickness` for rounded corners when `T > R` and corners are rounded; invalid hex rejected; per-type field requirements (circle without `diameter` rejected, rectangle without `width` rejected). Prior art: `normalize/label.rs` test suite (L108-249), `normalize/value.rs`.
3. **Frontend resolver (`backdrop-widget-resolver`)** — `initBackdropVariant` is non-destructive (preserves other variants); seeds from manifest defaults when variant absent; `resolveActiveBackdropData` flattens correctly for circle and rectangle, with shared fields preserved. Prior art: `tests/lib/metric-widget-resolver.test.js`.
4. **Frontend editor (`BackdropWidgetEditor`)** — user-event tests: display-type dropdown swap calls `initBackdropVariant` and commits the expected patch; the 2×2 corner grid toggles `round_*_*` on click; `corner_radius` slider writes to `display_variants.rectangle.corner_radius`; shared color/opacity fields write to top-level fields. Prior art: `tests/features/widget-editor/MetricWidgetEditor/test.jsx`.

Renderers (Rust `render/widgets/backdrop`, frontend `BackdropRenderer`) are not in the test list — they are harder to test meaningfully without snapshot infrastructure, and the validator + resolver tests cover the contract the renderers consume.

## Out of Scope

- Migration of frontend `TYPE_LABELS` for course/elevation/gradient/label to manifest-sourced (stays hardcoded in `widget-icons.jsx` for now; the manifest carries `label` values but the frontend doesn't yet read them for the legacy sections).
- Adding `rotation` to backdrops (explicitly excluded — backdrops cannot be rotated; if the need arises later, it's a separate PR).
- Adding more backdrop display types beyond `circle` and `rectangle`. The architecture supports future additions by extending the manifest's `backdrops.definitions` and adding `BackdropType` variants, but no further types ship in this PRD.
- Adding a visibility/hidden flag. Deletion is the way to remove a backdrop, matching existing widgets. A uniform visibility flag across all widget categories would be a separate feature.
- Future cleanup of `ValueConfig`'s `rotation.unwrap_or(0.0)` to be strictly required (out of scope; flagged for a future consistency pass since it diverges from the no-backend-defaults invariant).
- Snapshot/visual-diff testing infrastructure for renderers.

## Further Notes

- The grilling session that produced this PRD is captured in `.agents/scratch/backdrop/backdrop-plan.md`, which contains the full decision tree and resolution rationale. This PRD is the synthesis of that plan.
- ADRs / domain glossary: the plan honors the established invariants documented in `AGENTS.md`: backend owns zero render-affecting defaults, frontend materialises all defaults before IPC; Rust edition 2021 with `skia-safe 0.75`; JSX with JSDoc only (no TypeScript) on the frontend.
- The shared-loader pattern established here for `standard-widgets.json` mirrors `standard-metrics.json`. Once `BackdropType` and the `backdrops` definitions are shipped, future widget categories follow the same shape: extend the manifest, add a small Rust enum for dispatch, add a validator and a render module. Mirror metric widgets wherever applicable remains the standing rule.
- The "dimension = total size, border outside the fill" geometry (Q3 decision) means dragging the moveable handle resizes the **outer** extent. Future resize-handle integration must honor this: the drag bounds should snap to the nominal boundary, not the fill rectangle, so the user's drag matches the configured `width`/`height`.
# Backdrop Widgets — Implementation Plan

## Overview

Backdrops are a new widget category: simple geometric elements (circle, rectangle) rendered behind all other widgets as visual backdrops. They are pure-static (no per-frame interpolation) and join the static cache alongside labels and icons. Backdrops mirror the architecture of metric/value widgets wherever applicable; this plan records the agreed decisions and the few backdrop-specific divergences.

Two initial display types: `circle` and `rectangle`.

---

## 1. Shared manifest — `assets/standard-widgets.json`

### Restructure the whole file to the `definitions` shape

The file is restructured so every section uses `{ definitions: { <key>: { label, defaults } }, [defaults] }`. The file becomes a shared FE+Rust source of truth (today it is frontend-only).

```json
{
  "plot": {
    "definitions": {
      "course":      { "label": "Course",    "defaults": { ...existing course fields... } },
      "elevation":   { "label": "Elevation", "defaults": { ...existing elevation fields including point_label... } }
    }
  },
  "gradient": {
    "definitions": {
      "gradient":    { "label": "Gradient",  "defaults": { ...existing gradient fields... } }
    }
  },
  "label": {
    "definitions": {
      "label":       { "label": "Text",      "defaults": { ...existing label fields... } }
    }
  },
  "backdrops": {
    "defaults": ["rectangle"],
    "definitions": {
      "circle": {
        "label": "Circle",
        "defaults": {
          "display_type": "circle",
          "x": 100,
          "y": 100,
          "opacity": 1,
          "diameter": 200,
          "fill_color": "#ffffff",
          "fill_opacity": 1,
          "border_thickness": 0,
          "border_color": "#ffffff",
          "border_opacity": 1
        }
      },
      "rectangle": {
        "label": "Rectangle",
        "defaults": {
          "display_type": "rectangle",
          "x": 100,
          "y": 100,
          "opacity": 1,
          "width": 200,
          "height": 120,
          "fill_color": "#ffffff",
          "fill_opacity": 1,
          "border_thickness": 0,
          "border_color": "#ffffff",
          "border_opacity": 1,
          "corner_radius": 0,
          "round_top_left": false,
          "round_top_right": false,
          "round_bottom_left": false,
          "round_bottom_right": false
        }
      }
    }
  }
}
```

### Decisions
- Every section's definitions carry a `label` (uniform shape, future-shared with Rust). The frontend `TYPE_LABELS` (in `widget-icons.jsx`) is **not migrated** to manifest-sourced in this PR — it stays hardcoded for course/elevation/gradient/label.
- Only `backdrops` has a top-level `defaults` list (the default display_type). Other sections have a single definition each; no multi-type choice exists, so `defaults` is omitted there.
- `display_type` is embedded inside each `defaults` block (mirrors `standard-metrics.json:13`). Precedent uniformity over DRY.
- `point_label` nested object on elevation stays as-is (it is a nested default, not flattened).
- Backdrop `defaults` carry `opacity` at `0-1` (float, matching the top-level `opacity` and the linear gauge's `track_*_opacity` scale — not the legacy `0-100` plot opacity fields).

---

## 2. Rust backend

### 2a. New shared-manifest loader — `src-tauri/ovrley_core/src/standard_widgets.rs`

Structurally parallel to `standard_metrics.rs`:
- `static STANDARD_WIDGET_MANIFEST: OnceLock<StandardWidgetManifest>` + `load_manifest()` using `include_str!(concat!(CARGO_MANIFEST_DIR, "/../../assets/standard-widgets.json"))`.
- Raw serde structs (`#[serde(rename_all = "camelCase")]`) for the manifest shape.
- Accessor helpers parallel to `display_type_definition`, `display_type_label`, etc.
- Re-exported from `lib.rs`.

The property-list schema is parsed as data (no Rust mirror of the field names); the only hand-maintained Rust mirror is the `BackdropType` enum (see 2b), exactly as `DisplayType` is the only mirror for metrics.

### 2b. `BackdropType` enum — `src-tauri/ovrley_core/src/types.rs`

```rust
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BackdropType {
    #[serde(rename = "circle")]
    Circle,
    #[default]
    #[serde(rename = "rectangle")]
    Rectangle,
}
```

- **Strict Deserialize** — unknown/null `display_type` produces a serde error (`backdrops[i].display_type: expected "circle" or "rectangle"`). **No fallback** (unlike `DisplayType`, which falls back to `Text` for legacy compat). Backdrops have no legacy, so the no-backend-defaults rule is honored strictly.
- `as_str()` method returns the manifest key.

### 2c. Raw config — `src-tauri/ovrley_core/src/normalize/raw/mod.rs`

New `BackdropConfig` struct mirroring `ValueConfig`'s hybrid shape:
- Shared fields at top level as `Option<T>` (serde does not enforce required-ness, the validator does):
  - `id: Option<String>`
  - `x: f32`, `y: f32`
  - `opacity: Option<f32>`
  - `fill_color: Option<String>`, `fill_opacity: Option<f32>`
  - `border_thickness: Option<f32>`, `border_color: Option<String>`, `border_opacity: Option<f32>`
  - `display_type: BackdropType` (strict, no default fallback at serde layer; the validator enforces presence)
  - `display_variants: BTreeMap<String, serde_json::Value>` (raw; the validator promotes per-type geometry fields)
- **No `rotation` field** (backdrops cannot be rotated).

### 2d. Validator — `src-tauri/ovrley_core/src/normalize/backdrop.rs`

New module exposing `validate_backdrop(raw: &BackdropConfig, index: usize) -> CoreResult<ValidatedBackdrop>`. Reuses helpers from `normalize/helpers.rs` (`require_f32`, `require_bool`, `require_string`, `require_hex_color`, `rgba_from_hex`).

Flat `ValidatedBackdrop` struct mirroring `ValidatedValueWidget`:
- Carries all circle+rectangle fields, with `display_type: BackdropType` as discriminator.
- Unused fields per display_type are set to `0.0` / `0` / `false` (zero-initialized for the inactive type).
- Field types match `ValueConfig` precedent:
  - `x: f32`, `y: f32`, `border_thickness: f32`, `corner_radius: f32`, `opacity: f32`, `fill_opacity: f32`, `border_opacity: f32`
  - `diameter: u32`, `width: u32`, `height: u32`
  - `fill_color: String`, `border_color: String`, `id: String`
  - `display_type: BackdropType`
  - `round_top_left: bool`, `round_top_right: bool`, `round_bottom_left: bool`, `round_bottom_right: bool`

### Validation rules

| Field | Rule | Behavior |
|---|---|---|
| `id` | required string | Reject missing/empty (`require_string`). |
| `display_type` | strict enum | Reject unknown (serde layer). |
| `x`, `y` | required `f32`, finite | Reject non-finite (`require_f32`). |
| `opacity`, `fill_opacity`, `border_opacity` | `[0.0, 1.0]`, finite | Reject outside range (mirror `label.rs:84-89`, `linear_gauge.rs:143-149`). |
| `diameter` (circle) | `> 0` | Reject `<= 0` (mirror `linear_gauge.rs:87-92` width/height rule). |
| `width`, `height` (rectangle) | `> 0` | Reject `<= 0`. |
| `border_thickness` | `>= 0` | Reject negative. `0` is valid (border disabled). |
| `2 * border_thickness < min(width, height)` (rect) / `2 * border_thickness < diameter` (circle) | hard constraint | **Reject** if violated — border ring would overflow/negate the fill. |
| `corner_radius` | `>= 0` | Reject negative. **Crash-prevention clamp** to `min(width, height) / 2` (mirror `linear_gauge.rs:138`). |
| `corner_radius` vs `border_thickness` for rounded corners | UX reasonability | **Silent clamp** of `corner_radius` down to `border_thickness` when `T > R` and the corner is rounded (`round_*_* = true`). UX reasonability, not styling intent. Sharp corners (`round_*_* = false`) are unaffected. |
| `round_top_left`, `round_top_right`, `round_bottom_left`, `round_bottom_right` | required bool | Reject missing (`require_bool`). |
| `fill_color`, `border_color` | hex `^#(?:[0-9a-fA-F]{6}\|{8})$` | **Reject** if invalid (use `require_hex_color`). |

### Alpha composition

Final fill alpha = `fill_color.hex_alpha * fill_opacity * opacity`.
Final border alpha = `border_color.hex_alpha * border_opacity * opacity`.
Top-level `opacity` is a multiplier stacking multiplicatively with `fill_opacity`/`border_opacity` (mirror linear gauge stacking widget opacity with track opacities).

### 2e. Validator dispatch — `src-tauri/ovrley_core/src/normalize/mod.rs`

Add a `backdrops` iteration loop in `validate_render_config` (parallel to the `labels` loop at L120-125), producing `Vec<ValidatedBackdrop>`. Add `backdrops: Vec<ValidatedBackdrop>` field to `ValidatedRenderConfig`.

### 2f. Render module — `src-tauri/ovrley_core/src/render/widgets/backdrop.rs`

Single file (no subdirectory; backdrops need no `prepare_*_cache`, `frame_state`, or `simplify` like route/elevation do). Exposes:
- `draw_backdrop(canvas, validated_backdrop, scale)` — dispatches on `display_type` to circle or rectangle drawing.
- `draw_backdrops_static_layer(canvas, backdrops, scale)` — iterates all backdrops in array order; called from `static_layer.rs::cached_labels_image` (and `prepare_base_rgba`) **as the first drawing step** within the static image, before labels and icons. Backdrops therefore paint at the bottom of the static stack.
- Re-exported via `render/widgets/mod.rs`.

### 2g. Static cache integration — `src-tauri/ovrley_core/src/render/static_layer.rs`

Extend `cached_labels_image` (and `prepare_base_rgba`) to also bake backdrops into the same shared image.
- **Draw order within the static image: backdrops first → labels → icons.** Backdrops never end up above icons/labels.
- The cache key hash expands to include `backdrops` (so changing backdrops invalidates the cached image).
- Single shared `OnceLock<Mutex<HashMap<u64, Image>>>` table — no separate backdrop cache. (Within a render job, the cache is built once and blitted across frames; cross-job incremental reuse is not a concern for the render process.)

### 2h. Geometry — dimension semantics

Configured dimension = total (nominal visual size), border-outer edge inclusive.
Border drawn **outside** the fill: no overlap, no gap.
Fill is inset by `thickness` on each side.

**Circle:**
- `x, y` = top-left of the nominal `diameter × diameter` bounding box.
- Fill path radius = `diameter / 2 - thickness`.
- Stroke path radius = `(diameter - thickness) / 2`, stroke width = `thickness`.
- Total visual diameter = `diameter`.

**Rectangle:**
- `x, y` = top-left of the nominal `width × height` bounding box.
- Fill path = rounded-rect inset by `thickness`, radius `max(0, corner_radius - thickness)` per gated corner.
- Stroke path = rounded-rect inset by `thickness/2`, stroke width `thickness`, radius `corner_radius` per gated corner.
- `corner_radius` applies only to corners where the corresponding `round_*_*` boolean is `true`. Corners with `false` are sharp (radius 0) on all three paths (nominal, stroke, fill) consistently.
- Total visual size = `width × height`.

### 2i. Template integration

- New top-level `backdrops: []` array in the template file, parallel to `labels`/`values`.
- `#[serde(default)]` empty `Vec` on the Rust raw config — existing templates load with zero backdrops, no migration.
- Frontend treats missing `backdrops` as `[]`.
- Backend `ValidatedRenderConfig.backdrops: Vec<ValidatedBackdrop>` parallel to `labels`/`values`.

---

## 3. Frontend

### 3a. Manifest exports — `app/src/lib/widget/standard-widgets.js`

- Update existing exports (`COURSE_PLOT_DEFAULTS`, `ELEVATION_PLOT_DEFAULTS`, `GRADIENT_DEFAULTS`, `TEXT_LABEL_DEFAULTS`) to walk `*.definitions.*.defaults` instead of accessing flat keys.
- Add backdrop exports mirroring the metric pattern:
  - `BACKDROP_TYPE_DEFINITIONS` (key → definition, frozen)
  - `BACKDROP_TYPE_LABELS` (key → label)
  - `BACKDROP_DEFAULT_DISPLAY_TYPES = [...standardWidgetsManifest.backdrops.defaults]`
  - `BACKDROP_CIRCLE_DEFAULTS`, `BACKDROP_RECTANGLE_DEFAULTS` (frozen from manifest)
- Add `getBackdropTypeOptions()` helper (parallel to `getDisplayTypeOptions` in `standard-metrics.js:80-85`), sourced from `BACKDROP_TYPE_DEFINITIONS`. Used by `BackdropWidgetEditor`.

### 3b. Key whitelists — `app/src/lib/template/template-constants.js`

Add per-type whitelists mirroring `VALUE_SHARED_KEYS` + `DISPLAY_VARIANT_KEYS`:
- `BACKDROP_SHARED_KEYS = ['id', 'x', 'y', 'opacity', 'display_type', 'fill_color', 'fill_opacity', 'border_thickness', 'border_color', 'border_opacity']`
- `BACKDROP_CIRCLE_KEYS = ['diameter']`
- `BACKDROP_RECTANGLE_KEYS = ['width', 'height', 'corner_radius', 'round_top_left', 'round_top_right', 'round_bottom_left', 'round_bottom_right']`

Used during template normalization to strip unknown keys per `display_type` (mirror how `DISPLAY_VARIANT_KEYS` strips per boxed display_type).

### 3c. Widget flattening — `app/src/lib/widget/widget-presentation.js`

`buildConfigWidgets` emits `backdrops` array **first** in the flattened list: `backdrops → labels → values → plots`. Each entry: `{ id, type: 'backdrop', category: 'backdrops', index, name, data: <entry> }`. The sidebar list iterates this flattened list, so backdrops appear at the top of the sidebar accordion (consistent with draw order).

### 3d. Z-index — `app/src/features/overlay-editor/components/OverlayCanvas.jsx:166-169`

The z-policy lives on the **moveable wrapper div** (not inside the renderer — the wrapper's `transform` establishes a stacking context that traps inner z-index). Extend the existing per-category z-class line:

```jsx
widget.category === 'backdrops' && 'z-1',
widget.category === 'labels' && 'z-2',
widget.category === 'plots' && 'z-2',
widget.category === 'values' && 'z-10',
```

Tailwind v4 (`tailwindcss@4.2.2`) supports bare `z-1`, `z-2`. No negative z-index (avoids escaping the parent stacking context). Visual order (bottom→top): backdrops (z-1) → labels (z-2, first in DOM) → plots (z-2, after labels in DOM) → values (z-10, unchanged from current).

### 3e. Renderer — `app/src/features/widget-preview/components/BackdropRenderer.jsx`

Single file (no subdirectory), internal dispatch on `display_type`:
- `circle` → SVG `<circle>`.
- `rectangle` → SVG `<rect>` with per-corner radius work (asymmetric rounding requires SVG paths, since `<rect>` only supports uniform `rx`/`ry`).

Memoized with the same comparator pattern as other renderers. Registered in `WidgetPreview.jsx` dispatch hub as a `widget.type === 'backdrop'` branch (parallel to `label`/`course`/`elevation` branches).

### 3f. Drawer entry — `app/src/lib/widget/widget-icons.jsx`

- `TYPE_LABELS`: add `backdrop: 'Backdrop'`.
- `WIDGET_DRAWER_LABELS`: add `backdrop: 'Backdrop'` (no shortening needed).
- `WIDGET_ICONS`/`TYPE_ICONS`: add `backdrop: Presentation` (from `lucide-react`).
- `QUICKMENU_ITEMS`: insert `'backdrop'` at end of `general` group, before the metric types: `['label', 'time', 'elevation', 'course', 'gradient', 'backdrop', ...CURRENT_STANDARD_METRIC_WIDGET_TYPES]`.
- `NON_METRIC_CATEGORIES`: add `backdrop: 'general'`.

### 3g. Add-backdrop routine

Mirrors metric-widget "add" flow:
- Read default display_type from manifest: `BACKDROP_DEFAULT_DISPLAY_TYPES[0]` → `'rectangle'`.
- Seed shared fields from `BACKDROP_RECTANGLE_DEFAULTS` (the active type's defaults — mirror metrics reading `TEXT_DEFAULTS`): `id` (uuid), `x`, `y`, `opacity`, fill/border fields.
- Call `initBackdropVariant(seed, 'rectangle')` (parallel to `initDisplayVariant`) to pre-seed `display_variants.rectangle` with rectangle geometry defaults upfront (so the renderer reads valid geometry immediately — unlike text metrics, rectangle has 7 variant fields the user interacts with from the start).

Resulting shape:
```js
{
  id: <uuid>,
  x: 100, y: 100, opacity: 1,
  fill_color: '#ffffff', fill_opacity: 1,
  border_thickness: 0, border_color: '#ffffff', border_opacity: 1,
  display_type: 'rectangle',
  display_variants: {
    rectangle: { width: 200, height: 120, corner_radius: 0,
                 round_top_left: false, round_top_right: false,
                 round_bottom_left: false, round_bottom_right: false }
    // circle: absent — seeded lazily only if user switches
  },
}
```

### 3h. Display-type swap — `app/src/lib/widget/backdrop-widget-resolver.js`

New module parallel to `metric-widget-resolver.js`. Exposes:
- `resolveActiveBackdropData(widgetData)` — flattens shared top-level fields with active `display_variants[display_type]` for the renderer.
- `initBackdropVariant(widgetData, displayType)` — non-destructive: preserves existing `display_variants[<other types>]`, seeds `display_variants[displayType]` from `BACKDROP_<TYPE>_DEFAULTS` if absent. Mirror of `initDisplayVariant`.
- (Optional) `resetCurrentBackdropConfig`, `buildBackdropGeometryUpdate` if needed for resize handle integration.

BackdropWidgetEditor's display-type dropdown calls `initBackdropVariant` on change, then commits `{ display_type: newType, display_variants: nextData.display_variants }` — exact mirror of `MetricWidgetEditor.jsx:40-46`.

### 3i. Editor — `app/src/features/widget-editor/components/BackdropWidgetEditor.jsx`

Single file (no subdirectory; backdrops have only ~13 fields max and ~7 shared between shapes). Inline circle/rectangle sections rather than separate section files.

Layout:
- **Display Type** dropdown (`SelectField` populated by `getBackdropTypeOptions()`).
- **Shared section** (color pickers, opacity sliders, border thickness): `fill_color`, `fill_opacity`, `border_thickness`, `border_color`, `border_opacity`, top-level `opacity`.
- **Shape-specific section** rendered conditionally on `display_type`:
  - **Circle:** `diameter` numeric input.
  - **Rectangle:** a 2-column CSS grid layout:
    - Column 1 (spans 2 rows): **2×2 visual corner grid** — small SVG rectangle with 4 clickable corner regions. Each corner toggles `round_*_*`. Active corners render curved at the current `corner_radius`; inactive render sharp. Filled/highlighted background when active. Implements Q21's two-row visual grid.
    - Column 2 (1-2 rows stacked beside the grid): `corner_radius` slider, `border_thickness` (if not already in shared section), `width` and `height` numeric inputs.

Reuses shared control infrastructure: `widgetFormControls.jsx` (`SelectField`, color pickers, number inputs, sliders), `widgetEditorSections.jsx` (`PositionSection`).

### 3j. Sidebar editor dispatch — `app/src/features/widget-editor/components/SidebarWidgetsTab.jsx`

Add `backdrop: BackdropWidgetEditor` to `WIDGET_EDITOR_MAP` (L28-34). The existing dispatch in `renderWidgetEditor` (L45-54) handles it via the map.

---

## 4. Architectural invariants honored

- **No backend defaults for styling.** Backend rejects missing/invalid styling fields; the frontend materialises all defaults from the manifest before dispatching a render job. The only silent clamps are: `corner_radius` to `min(w,h)/2` (crash-prevention, mirror `linear_gauge.rs:138`) and `corner_radius` to `border_thickness` for rounded corners when `T > R` (UX reasonability, not styling intent).
- **Mirror metric/value widgets wherever applicable.** Field types, hybrid storage shape (`shared` top-level + `display_variants.<type>`), non-destructive display-type swap (`initDisplayVariant` parallel), validation philosophy, render module structure under `render/widgets/`, frontend editor dispatch via `WIDGET_EDITOR_MAP`, manifest exports pattern.
- **Manifest as single source of truth** for default values, labels, default display_type, and the list of available backdrop types. Both FE and Rust load `standard-widgets.json` via `include_str!`/Vite import.
- **Backdrops are static, lowest z, rendered first.** Drawn into the shared static cache image (backdrops → labels → icons order); z-1 on the moveable wrapper in `OverlayCanvas.jsx`; first in the flattened `widgets` array (sidebar + DOM order).

---

## 5. Out of scope

- Migration of frontend `TYPE_LABELS` for course/elevation/gradient/label to manifest-sourced (stays hardcoded in `widget-icons.jsx` for now).
- Adding `rotation` to backdrops (explicitly excluded — backdrops cannot be rotated).
- Adding more backdrop display types beyond `circle` and `rectangle` (the architecture supports future additions by extending the manifest's `backdrops.definitions` + adding `BackdropType` variants).
- Adding a visibility/hidden flag (deletion is the way to remove a backdrop, matching existing widgets).
- Future cleanup of `ValueConfig`'s `rotation.unwrap_or(0.0)` to be strictly required (out of scope; flagged for future consistency pass).
# Widgets Implementation Plan

Source: `widgets-design.md` decisions from grilling session.

## Goals

Implement four new metric text widgets:

1. `gps_coordinates` — latitude, longitude, or both; DMS or DDM format.
2. `distance_to_home` — 2D haversine distance from current GPS sample to first valid GPS sample.
3. `total_ascent` — cumulative positive elevation gain; optional `current / final` slash display.
4. `calories` — parsed from FIT records or GPX extensions; not derived.

Also clean up the altitude schema so elevation-consuming features can prefer barometric altitude when available.

---

## 1. Altitude schema consolidation

### Decisions

- Remove the redundant `altitude` raw field.
- `elevation` = generic source elevation (GPX `<ele>`, etc.).
- `barometric_altitude` = barometric altitude when the parser can identify it.
- Elevation profile, gradient derivation, and total ascent prefer `barometric_altitude`, falling back to `elevation`.
- Existing `altitude` metric widget is rewired to use `elevation`.

### Files

- `src-tauri/ovrley_core/src/activity/schema.rs`
  - Remove `altitude: NumericSeries` from `ActivityColumns`.
  - Remove `altitude: Option<f64>` from `RawSample`.
  - Add `barometric_altitude: NumericSeries` to `ActivityColumns`.
  - Add `barometric_altitude: Option<f64>` to `RawSample`.
- `app/src/lib/activity/fit-parser.js`
  - Remove `altitude` from raw sample output.
  - FIT records expose `altitude` (and `enhanced_altitude`), not `elevation`. This value is barometric, so set both fields from it:
    - `barometric_altitude: safeNumber(record.enhanced_altitude ?? record.altitude)`.
    - `elevation: safeNumber(record.enhanced_altitude ?? record.altitude)`.
  - If FIT ever exposes a separate GPS altitude field, populate `elevation` from that instead and keep `barometric_altitude` barometric-only.
- `app/src/lib/activity/gpx-parser.js`
  - Remove `altitude` from raw sample output.
  - Set `barometric_altitude` from extensions if present.
  - Keep `elevation` from `<ele>`.
- `app/src/lib/activity/srt-parser.js` / `igc-parser.js`
  - Remove `altitude` from raw sample output; keep `elevation`.
- `src-tauri/ovrley_core/src/activity/finalize.rs`
  - Update column construction to map `barometric_altitude` and drop `altitude`.
- `src-tauri/ovrley_core/src/activity/interpolate.rs`
  - Add `barometric_altitude` to interpolation where needed.
  - Add `barometric_altitude` to `DenseActivityReport`.
- `src-tauri/ovrley_core/src/activity/finalize/metrics.rs`
  - Update gradient/vertical_speed derivation to prefer `barometric_altitude` over `elevation`.
- `src-tauri/ovrley_core/src/normalize/mod.rs`
  - Add `barometric_altitude` to `RenderDataRequirements` if needed.
- `assets/standard-metrics.json`
  - Change the existing `altitude` metric data source to `elevation`.
- Frontend widgets/preview that read `altitude` directly
  - Search for direct references and migrate to `elevation`.

### Verification

- `cargo test` in `src-tauri/ovrley_core/` passes.
- Existing altitude widget still renders in preview.
- Elevation profile still renders.

---

## 2. Add new metric definitions to the manifest

### Files

- `assets/standard-metrics.json`
  - Add `gps_coordinates` definition:
    - `type: "gps_coordinates"`
    - `label: "GPS Coordinates"`
    - `formatter: "coordinates"` (new formatter)
    - `display_type: "text"`
    - `defaultDisplayUnit: "both"`
    - `supportedDisplayUnits`: `[{ value: "latitude", label: "Lat" }, { value: "longitude", label: "Lon" }, { value: "both", label: "Lat/Lon" }]`
    - `showUnitsByDefault: false`
    - `interpolation: "linear"` (for lat/lon selection)
    - `unitsMode: "selectable"`
    - `icon`: `{ "source": "custom", "assetFile": "widget-satellite.svg" }` (recreated from Lucide `satellite`)
    - `category: "general"`
    - Add a display-type default override or display variant for `coordinate_format` (`dms` | `ddm`).
  - Add `distance_to_home` definition:
    - `type: "distance_to_home"`
    - `label: "Distance to Home"`
    - `formatter: "distance"` (reuse distance formatter)
    - `defaultDisplayUnit: "m"`
    - `supportedDisplayUnits`: m, km, mi
    - `category: "other"`
    - `icon`: `{ "source": "custom", "assetFile": "widget-house.svg" }` (recreated from Lucide `house`)
  - Add `total_ascent` definition:
    - `type: "total_ascent"`
    - `label: "Total Ascent"`
    - `formatter: "elevation"` or new `ascent` formatter
    - `defaultDisplayUnit: "m"`
    - `supportedDisplayUnits`: m, ft
    - `category: "general"`
    - `icon`: `{ "source": "custom", "assetFile": "widget-arrow-up-narrow-wide.svg" }` (recreated from Lucide `arrow-up-narrow-wide`)
    - Add display variant `show_full_ascent: bool` (similar to `show_full_distance`).
  - Add `calories` definition:
    - `type: "calories"`
    - `label: "Calories"`
    - `formatter: "integer"`
    - `defaultDisplayUnit: "kcal"`
    - `supportedDisplayUnits`: kcal
    - `category: "other"`
    - `icon`: `{ "source": "custom", "assetFile": "widget-calories.svg" }` (custom flame without text/label)
    - `showUnitsByDefault: true`

### Verification

- `standard-metrics.json` validates against any JSON schema checks.
- Frontend `standard-widgets.js` exposes the new definitions without errors.

---

## 3. Add `MetricKind` variants

### Files

- `src-tauri/ovrley_core/src/types.rs`
  - Add `GpsCoordinates`, `DistanceToHome`, `TotalAscent`, `Calories` to the `MetricKind` enum (or equivalent).
- `src-tauri/ovrley_core/src/standard_metrics.rs`
  - Add key mappings for the new types.
  - Ensure `metric_kind_from_key` / `metric_kind_to_key` handle the new keys.
- `src-tauri/ovrley_core/src/render/widgets/value/icons.rs`
  - Add `MetricIconAssetKey` variants mapping to `widget-house.svg`, `widget-satellite.svg`, `widget-arrow-up-narrow-wide.svg`, and `widget-calories.svg` via `include_str!`.

### Verification

- `cargo check` passes.

---

## 4. Implement calories parsing

### Decisions

- Sample-level only. If absent, the metric is missing.
- FIT `record.calories` is cumulative kcal.
- GPX extensions: `calories`, `kcal`, `energy`.

### Files

- `app/src/lib/activity/fit-parser.js`
  - Add `calories: safeNumber(record.calories)` to raw samples.
- `app/src/lib/activity/gpx-parser.js`
  - Add `calories: readTrackPointMetric(extensionValues, ['calories', 'kcal', 'energy'])`.
- `src-tauri/ovrley_core/src/activity/schema.rs`
  - Add `calories: NumericSeries` to `ActivityColumns`.
  - Add `calories: Option<f64>` to `RawSample`.
- `src-tauri/ovrley_core/src/activity/finalize.rs`
  - Pass `calories` column through.
- `src-tauri/ovrley_core/src/activity/interpolate.rs`
  - Add `calories` to interpolation and `DenseActivityReport`.
- `src-tauri/ovrley_core/src/normalize/mod.rs`
  - Add `calories` to `RenderDataRequirements`.

---

## 5. Implement distance-to-home derivation

### Decisions

- Home point = first valid GPS coordinate in the activity.
- Distance = 2D haversine surface distance.
- Units: m, km, mi.

### Files

- `src-tauri/ovrley_core/src/activity/finalize/metrics.rs`
  - Add `derive_distance_to_home_series`.
  - Find first valid `(lat, lon)`.
  - For each sample with valid coordinates, compute haversine distance to home.
  - Return a `NumericSeries`.
  - Wire into `derive_activity_metric_series`.
- `src-tauri/ovrley_core/src/activity/schema.rs`
  - Add `distance_to_home: NumericSeries` to `ActivityColumns` and `ParsedActivity` if needed.
- `src-tauri/ovrley_core/src/activity/interpolate.rs`
  - Add `distance_to_home` to interpolation and `DenseActivityReport`.
- `src-tauri/ovrley_core/src/normalize/mod.rs`
  - Add `distance_to_home` to `RenderDataRequirements`.
- `src-tauri/ovrley_core/src/render/format.rs`
  - Ensure distance formatter handles `distance_to_home` with m/km/mi.
- `app/src/features/widget-preview/widgets/metric/format.js`
  - Ensure distance formatter handles the new widget.

---

## 6. Implement total-ascent derivation

### Decisions

- Source priority: `barometric_altitude` > `elevation`.
- Smooth the source series first, then sum positive deltas.
- Toggle `show_full_ascent` renders `current_cumulative / final_total`.

### Files

- `src-tauri/ovrley_core/src/activity/finalize/metrics.rs`
  - Add `derive_total_ascent_series`.
  - Select source: `barometric_altitude` if any present, else `elevation`.
  - Apply smoothing (reuse existing smoothing infrastructure or a small fixed window).
  - Sum positive deltas to produce cumulative ascent.
  - Wire into `derive_activity_metric_series`.
- `src-tauri/ovrley_core/src/activity/schema.rs`
  - Add `total_ascent: NumericSeries`.
- `src-tauri/ovrley_core/src/activity/interpolate.rs`
  - Add `total_ascent` to interpolation and `DenseActivityReport`.
- `src-tauri/ovrley_core/src/normalize/mod.rs`
  - Add `total_ascent` to `RenderDataRequirements`.
- `src-tauri/ovrley_core/src/render/format.rs`
  - Add formatter for `total_ascent` with m/ft.
  - Add `show_full_ascent` slash rendering similar to `show_full_distance`.
- `app/src/features/widget-preview/widgets/metric/format.js`
  - Add ascent formatter and slash rendering.
- `app/src/features/widget-preview/widgets/metric/model.js`
  - Add model support for `total_ascent` and `show_full_ascent`.
- `app/src/features/widget-editor/components/metricWidget/TextDisplaySection.jsx`
  - Add toggle for `show_full_ascent`.

### Verification

- Unit test: known elevation profile, verify cumulative positive gain.
- Unit test: smoothing behavior on noisy high-rate data.

---

## 7. Implement GPS coordinates formatter/renderer

### Decisions

- `display_unit`: `latitude` | `longitude` | `both`.
- `coordinate_format`: `dms` | `ddm`.
- Unit color controls N/S/E/W letters.
- Symbols share digit color.
- “both” returns a structured pair `{ top, bottom }` rendered stacked at 40% font size.
- No flexbox; explicit positioning in both frontend SVG preview and Rust Skia renderer.

### Coordinate formats

**DMS**: `N 40° 26′ 46″`
**DDM**: `N 40° 26.767′`

### Files

- Frontend formatting:
  - `app/src/features/widget-preview/widgets/metric/format.js`
    - Add `formatCoordinates` helper.
    - Accept `value` as `[lat, lon]`, `display_unit`, `coordinate_format`, `unit_color`.
    - Return string or `{ top, bottom }`.
- Frontend model:
  - `app/src/features/widget-preview/widgets/metric/model.js`
    - Build preview model for `gps_coordinates`.
    - Pass full coordinate pair to formatter.
    - For `both`, compute two-line layout with 40% font size and small gap.
- Frontend editor:
  - `app/src/features/widget-editor/components/metricWidget/TextDisplaySection.jsx`
    - Add coordinate format dropdown for `gps_coordinates`.
    - Unit dropdown already supports `latitude`/`longitude`/`both`.
- Backend formatting:
  - `src-tauri/ovrley_core/src/render/format.rs`
    - Add coordinate formatting for `MetricKind::GpsCoordinates`.
    - Access `course_lat` and `course_lon` from `DenseActivityReport`.
    - Return formatted parts; for `both`, return top/bottom strings.
- Backend rendering:
  - `src-tauri/ovrley_core/src/render/widgets/value/mod.rs`
    - Handle the structured pair case: render two lines stacked with explicit y offsets, each at 40% font size.
  - `src-tauri/ovrley_core/src/render/widgets/value/icons.rs`
    - Map `widget-satellite.svg` asset.

### Verification

- Unit tests for DMS/DDM conversion at positive/negative lat/lon and edge cases (equator, prime meridian).
- Preview test: `both` mode renders two stacked lines.
- Renderer test: Skia output matches expected layout.

---

## 8. Icon assets

### Files

The icons from Lucide and link: https://static.vecteezy.com/system/resources/previews/060/183/274/non_2x/calorie-burn-icon-fire-flame-and-kcal-symbol-in-black-vector.jpg must recreated ABSOLUTELY EXACTLY, download the lucide icons and literally copy the paths. Recreate the flame icon without text/label based on the reference image. All icons must be standalone SVG assets.

- `assets/widget-icons/`
  - Add `widget-house.svg` — recreate from Lucide `house` (or equivalent) as a standalone SVG asset.
  - Add `widget-satellite.svg` — recreate from Lucide `satellite` as a standalone SVG asset.
  - Add `widget-arrow-up-narrow-wide.svg` — recreate from Lucide `arrow-up-narrow-wide` as a standalone SVG asset.
  - Add `widget-calories.svg` — custom flame icon without text/label, based on the reference image in `widgets-design.md`.
- `app/src/lib/widget/widget-icon-data.js` (or equivalent)
  - Register new icon assets by asset file name.
- `src-tauri/ovrley_core/src/render/widgets/value/icons.rs`
  - Map `MetricIconAssetKey` to new SVG files via `include_str!`.

### Verification

- All icons render in frontend preview.
- All icons render in Rust Skia renderer.

---

## 9. Config validation

### Files

- `src-tauri/ovrley_core/src/normalize/raw/mod.rs`
  - Ensure `ValueConfig` can carry new display variants:
    - `coordinate_format` for GPS coordinates.
    - `show_full_ascent` for total ascent.
- `src-tauri/ovrley_core/src/normalize/value.rs`
  - Validate new fields explicitly.
  - Reject unknown/unexpected variants for these metrics.

### Verification

- Validation tests for each new widget config pass.
- Malformed configs fail loudly.

---

## 10. Frontend widget editor

### Files

- `app/src/features/widget-editor/components/metricWidget/TextDisplaySection.jsx`
  - Show coordinate format dropdown when widget type is `gps_coordinates`.
  - Show `show_full_ascent` toggle when widget type is `total_ascent`.
- `app/src/features/widget-editor/components/widgetEditorSections.jsx`
  - Ensure `UnitsControlRow` and other sections support the new units.

### Verification

- Editor UI allows selecting all new options.
- Preview updates immediately on config change.

---

## 11. Testing plan

### Rust tests (`src-tauri/ovrley_core/`)

- Schema serialization/deserialization with new fields.
- FIT/GPX-like JSON finalization produces expected series.
- Haversine distance-to-home values for a known path.
- Total ascent positive-delta calculation with smoothing.
- Coordinate DMS/DDM formatting for representative lat/lon values.
- Config validation accepts valid widgets and rejects malformed ones.

### Frontend tests (`app/`)

- Preview rendering for each new widget.
- Formatter outputs for coordinates, distance-to-home, total ascent, calories.
- Editor state updates for new display variants.

---

## 12. Implementation order

1. **Schema cleanup** — remove `altitude`, add `barometric_altitude`.
2. **Update parsers** — FIT/GPX/SRT/IGC to emit new schema.
3. **Update finalization/interpolation** — wire new fields through to dense report.
4. **Update gradient/elevation profile** — prefer `barometric_altitude`.
5. **Add manifest entries** — four new metrics.
6. **Add `MetricKind` variants and icon mappings**.
7. **Implement calories parsing** (simplest, only parsed).
8. **Implement distance-to-home derivation**.
9. **Implement total-ascent derivation**.
10. **Implement GPS coordinates formatter/renderer**.
11. **Add icon assets**.
12. **Add editor UI controls**.
13. **Write tests**.
14. **Run full test suite**: `cargo test` + `npx vitest run`.

---

## Open risks

- Unless you have 100% evidence that old template needs a shim for the altitude-barometric_altitude change, do not add any compatibility shims. I do not think that this should be the case - the templates store widgets, not which data the widget pulls from.
- GPS coordinates “both” mode requires special two-line rendering in both SVG and Skia; keep the layout logic duplicated but consistent.

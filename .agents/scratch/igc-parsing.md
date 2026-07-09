# IGC Parsing Implementation Plan - DONE

## Goal

Add `.igc` flight-log parsing to the activity import pipeline, mirroring the existing FIT/GPX/SRT flow. The backend stays format-agnostic: a new frontend adapter converts `igc-parser` output into the `RawActivity` JSON contract, then the generic finalizer in `src-tauri/ovrley_core/src/activity/finalize.rs` does the rest.

## Dependency

- Pin `igc-parser` to the latest master commit **without forking**, mirroring how `telemetry-parser` is pinned in `src-tauri/ovrley_core/Cargo.toml` (git + rev).
- Latest `HEAD` of `Turbo87/igc-parser`: `29672f82c87b93cc2c44b567421a97c05383ea4c`.
- The package ships a prebuilt `index.js` + `index.d.ts` from the repo root (`main: "index.js"`, `export = IGCParser`), so no build step is needed after install. It pulls in the transitive dep `flight-recorder-manufacturers@^2.0.0`.

### `app/package.json`

```json
"igc-parser": "git+https://github.com/Turbo87/igc-parser.git#29672f82c87b93cc2c44b567421a97c05383ea4c"
```

The package is TypeScript-compiled-to-JS exposed via CommonJS (`module.exports = IGCParser`). Vite's CJS interop handles this exactly like the existing `fit-file-parser` import.

## File Changes

### 1. `app/src/lib/activity/igc-parser.js` (new)

Async adapter `parseIgcActivityFile(file)`:

```js
import IGCParser from "igc-parser";
import { safeNumber } from "./raw-sample-utils.js";

export default async function parseIgcActivityFile(file) {
  const result = IGCParser.parse(await file.text(), { lenient: true });
  if (!result.fixes?.length) throw new Error("The IGC file does not contain any fix records.");

  const firstTimestamp = result.fixes[0].timestamp;
  const raw_samples = result.fixes.map((fix) => {
    const ts = new Date(fix.timestamp).toISOString();
    const elapsed_seconds = (fix.timestamp - firstTimestamp) / 1000;
    const elevation = safeNumber(fix.gpsAltitude);
    const altitude = safeNumber(fix.pressureAltitude);
    if (!fix.valid) {
      return {
        timestamp: ts,
        elapsed_seconds,
        latitude: null,
        longitude: null,
        elevation: null,
        altitude: null,
        speed: readExt(fix, "GSP", (v) => safeNumber(v) / 3.6),
        heading: readExt(fix, "TRT", safeNumber),
        vertical_speed: readExt(fix, "VAT", (v) => safeNumber(v) / 10),
        temperature: readExt(fix, "OAT", readOat),
      };
    }
    return {
      timestamp: ts,
      elapsed_seconds,
      latitude: safeNumber(fix.latitude),
      longitude: safeNumber(fix.longitude),
      elevation,
      altitude,
      speed: readExt(fix, "GSP", (v) => safeNumber(v) / 3.6),
      heading: readExt(fix, "TRT", safeNumber),
      vertical_speed: readExt(fix, "VAT", (v) => safeNumber(v) / 10),
      temperature: readExt(fix, "OAT", readOat),
    };
  });

  return {
    file_name: file.name,
    file_format: "igc",
    metadata: {
      activity_name: result.date && result.pilot ? `${result.date} – ${result.pilot}` : result.date || null,
      date: result.date,
      glider_type: result.gliderType,
      timezone: result.timezone,
      logger_manufacturer: result.loggerManufacturer,
      logger_type: result.loggerType,
      parse_errors: result.errors?.length ? result.errors.map((e) => String(e.message || e)) : null,
    },
    raw_samples,
    options: {
      skip_idle_gap_fill: false,
      smoothing: {
        heading: { enabled: true, method: "circular_ema", window_seconds: 0.5 },
      },
    },
  };
}
```

#### Key decisions baked into the adapter

**Parse mode:** `lenient: true` — per-line errors are collected in `result.errors` and parsing continues. Adapter still throws when no usable fixes are produced. Robust across diverse IGC logger vendors.

**Timestamp representation:** RFC3339 string + explicit `elapsed_seconds`.

- `fix.timestamp` is Unix epoch ms from the parser; the parser already advances the day when fixes cross midnight, so its epoch values are correct.
- `timestamp = new Date(fix.timestamp).toISOString()` — backend's `build_time_series` only parses RFC3339 strings; numeric epochs would be silently dropped.
- `elapsed_seconds = (fix.timestamp - fixes[0].timestamp) / 1000` — explicit elapsed lets `build_elapsed_series`'s `last_value = last_value.max(current)` dedupe cleanly. IGC loggers occasionally emit duplicate timestamps for the same second at 1Hz.

**Altitude mapping:**

- `gpsAltitude` (WGS84 ellipsoidal, meters) → `elevation` — drives elevation/gradient widgets.
- `pressureAltitude` (barometric, meters) → `altitude` — alternate channel preserved as its own metric.
- Both `null` when source is `null` (encoded as `00000`).

**Invalid (V-flagged) fixes:** Keep the sample slot, null out lat/lon/elevation/altitude. Preserves the timestamp timeline; course/distance/heading get gap-filled or interpolated by the backend as needed. (Matches the "preserve N samples, let the finalizer interpolate" philosophy.)

**Record extensions (`fix.extensions` 3-letter codes → RawSample series):**

| Code | RawSample slot   | Conversion                    | Why                                                                                        |
| ---- | ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| GSP  | `speed`          | km/h → m/s (÷3.6)             | Standard IGC ground speed                                                                  |
| TRT  | `heading`        | degrees, ÷1                   | Track true                                                                                 |
| VAT  | `vertical_speed` | m/s×10 → m/s (÷10)            | Variometer, widely-agreed convention                                                       |
| OAT  | `temperature`    | 4-digit → ÷100; ≤3-digit → ÷1 | Outside air temp; scale is ambiguous across vendors, heuristic best-effort                 |
| TAS  | —                | skipped                       | No `airspeed` RawSample slot; preserve `speed` as ground speed                             |
| ENL  | —                | skipped                       | No RawSample slot; `igc-parser` already exposes `fix.enl` normalized 0..1 if wanted later  |
| FXA  | —                | skipped                       | No RawSample slot; `igc-parser` already exposes `fix.fixAccuracy` (meters) if wanted later |

Raw extension data takes priority over backend derivation when present; the backend's `derive_activity_metric_series` still backfills `speed`/`heading`/`gradient`/`vertical_speed` from the GPS course + elevation deltas when the source file omits GSP/TRT/VAT.

**Metadata shape (trimmed):** The backend's `metadata` field is opaque `serde_json::Value` passed through; the only fields actually consumed anywhere (frontend `createMediaSlice.js:123-130`) are the ones the backend injects post-finalize (`sync_time`, `duration_seconds`, `end_time`, `sample_count`, `total_distance_m`). Format-specific provenance is preserved for forward-compat but never read by widgets. Keep the minimal useful set:

- `activity_name` (`<date> – <pilot>` when both exist, else `date`, else `null`)
- `date`, `glider_type`, `timezone`, `logger_manufacturer`, `logger_type`
- `parse_errors` (array of error messages from lenient mode, or `null`)

**RawActivityOptions:** Mirror FIT/GPX.

- `skip_idle_gap_fill: false` — IGC B-records are 1Hz continuous GPS fixes; idle-gap-fill runs over natural pre/post-flight dead time like the analogous binary/text parsers.
- `smoothing: { heading: { enabled: true, method: 'circular_ema', window_seconds: 0.5 } }` — only heading needs wraparound-safe smoothing. Backend's own metric derivation handles noise in derived `speed`/`vertical_speed`/`gradient`; raw VAT-promoted vertical speed is trusted as-is.

### 2. `app/src/lib/activity/import-activity.js` (edit)

Add the import and the dispatch line alongside the existing FIT/GPX/SRT branches:

```js
import { parseIgcActivityFile } from './igc-parser.js'
// ...
else if (lowerName.endsWith('.igc')) rawActivity = await parseIgcActivityFile(file)
```

`lowerName` is already lowercased, so a single `endsWith('.igc')` covers both `.igc` and `.IGC` extensions seen in the wild (and in the igc-parser fixtures: `654G6NG1.IGC`, `MD_85ugkjj1.IGC`).

### 3. Fixtures (copy verbatim)

Copy all 8 files from `Turbo87/igc-parser/fixtures/` into `src-tauri/ovrley_core/tests/fixtures/activity/`:

- `1G_77fv6m71.igc`
- `2016-11-08-xcs-aaa-02.igc`
- `20180427.igc`
- `20211015.igc`
- `20241007TZN.igc`
- `654G6NG1.IGC`
- `MD_85ugkjj1.IGC`
- `lad_lod_extensions.igc`

These cover diverse loggers (LXNAV, Skytraxx, xcs, etc.) — useful for round-trip testing the adapter.

### 4. `app/src/tests/lib/igc-parser.test.js` (new, minimal)

Vitest round-trip test, one concise case per fixture (no per-field overkill):

- Read the 8 fixtures via `node:fs` from `src-tauri/ovrley_core/tests/fixtures/activity/` (single source of truth; vitest runs under Node, so `node:fs` is fine).
- For each: call `parseIgcActivityFile({ name, text: () => Promise.resolve(text) })`.
- Assert `raw_samples.length > 0`.
- Assert every `raw_samples[].timestamp` parses as RFC3339.
- Assert `latitude`/`longitude` are numeric (or `null`) on each sample.
- Assert `file_format === 'igc'` and `metadata` carries the agreed keys.

### 5. `src-tauri/ovrley_core/tests/fixtures/activity/igc-parse-debug.json` (vendored)

Capture once (manually or via the dev-mode debug writer) the `RawActivity` payload the frontend adapter produces for a representative fixture (e.g. `20180427.igc`). This mirrors the existing `fit-parse-debug.json` / `gpx-parse-debug.json` pattern.

### 6. Backend test entry (small extension, no overkill)

Either extend `src-tauri/ovrley_core/tests/activity_extraction_tests.rs` with a small loop, or add a sibling test that:

- Reads `igc-parse-debug.json` from the fixtures dir.
- Calls `ovrley_core::activity::finalize::finalize_raw_activity_json(input, None)`.
- Asserts the returned `ParsedActivity` has non-empty `sample_elapsed_seconds`, `sample_course_points`, and `time`.

No backend parser/format code is added — the finalizer is already format-agnostic. The captured `RawActivity` JSON is sufficient to exercise the shared core path with real IGC-derived content.

## Out of Scope

- Forking or patching `igc-parser` (pinned as git dep only).
- Backend Rust edits beyond adding/reading the vendored debug JSON fixture for the finalize-snapshot test.
- Mapping IGC codes TAS/ENL/FXA (no RawSample slots exist for them in the current backend contract).
- Per-field exhaustive assertions in the tests; kept minimal to avoid brittleness as the finalizer evolves.

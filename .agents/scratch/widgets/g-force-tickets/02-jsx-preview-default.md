# 02 — JSX preview renders the G-Force display type in the running app with default config

**What to build:**

The G-Force display type appears in the display-type dropdown for a `g_force` metric widget, renders a correct on-screen SVG preview at video frame rate using the SAME `max_g` computation that the Rust path will later write into the encoded video.

Implement `features/widget-preview/widgets/g-force/` (mirroring the heading preview's file structure): a presentation component (`GForcePreview.jsx`) and a model hook (`useGForcePreview.js`) computing `max_g` independently from the activity series + widget config. The JSX computation must mirror the Rust computation exactly — same percentile convention (nearest-rank), same invert-at-series-read stage, same linear interpolation, same clamp, same "--" missing-data text, same decimal formatting shape (reusing the existing JS formatter the elevation preview calls).

Wire the display type into dispatch: `WidgetPreview.jsx` adds a `widget.data.display_type === 'g_force'` clause routing to `OverlayGForceWidget`, mirroring how the other display types are dispatched. The display-type dropdown for a `g_force` metric widget exposes the new G-Force option automatically because of the metric override added in ticket 01.

The editor at this stage is a placeholder — standard layout/paint controls (x, y, rotation, opacity, diameter, fill color, fill opacity, border thickness, border color, dot size, dot color, dot opacity, text fields) wired through the existing shared metric-widget controls. The axis-mapping minitabs + invert switches are NOT in this ticket; the widget uses the default axis mapping (`horizontal = "x"`, `vertical = "y"`) with both invert switches off. The value font must be seeded from global font values settings when adding the widget - this value must be updated when the global font values change. The value must be seeded properly also when the display type is changed from text to this plot display type.

Border should be drawn without overlapping the inner circle fill. Use mask if necessary. Shadow should be applied on the dot, border, and the text. Consult other widgets to understand implementation; the rust path is authoritative - JSX preview must mirror the rust path exactly.

Frontend tests added in this ticket:

1. `GForceRenderer.test.jsx` (mirroring `ElevationRenderer.test.jsx`): renders `OverlayGForceWidget` with a known activity fixture at a fixed previewSecond, asserts the parent `<circle>` carries the configured radius/fill/stroke-width, the dot `<circle>` has `cx`/`cy` matching the closed-form for the fixture's interpolated sample, the text `<text>` content matches `"<magnitude> G"`, and the `unit` element matches `"G"`. A second case renders with an activity that has no `g_force_*` series and asserts dot at centre + text `"--"`.
2. A Vitest test reads the fixture committed in ticket 01 from `src-tauri/ovrley_core/tests/fixtures/g_force/` and asserts the JSX `max_g` derivation matches the same `expected max_g` value recorded in the fixture. Drift between Rust and JSX surfaces as a failing Vitest.

The dispatch is also covered by the existing `WidgetPreview-dispatch.test.jsx` pattern: it gains a `display_type === 'g_force'` clause asserting `OverlayGForceWidget` is rendered.

Demoable in the running dev app: `pnpm dev:frontend`, add a `g_force` metric widget, change its display type to G-Force, and see a circle with a dot moving in sync with the activity timeline scrub, with the bottom-right text showing the magnitude.

**Blocked by:** 01 — G-Force display type renders a correct frame end-to-end on the Rust path.

**Status:** ready-for-agent

- [ ] `features/widget-preview/widgets/g-force/` implements `OverlayGForceWidget` (presentational SVG) and a model hook computing `max_g` independently from the activity series + widget config
- [ ] JSX computation mirrors Rust exactly: same percentile convention (nearest-rank), invert at series-read, linear interpolation, clamp to edge, "--" missing-data text, zero-magnitude "0.0 G" text, decimal formatter reusing the existing JS formatter
- [ ] `WidgetPreview.jsx` dispatches `widget.data.display_type === 'g_force'` to `OverlayGForceWidget`
- [ ] Display-type dropdown for the `g_force` metric shows the new G-Force option via the override from ticket 01
- [ ] Placeholder editor exposes standard layout/paint controls only (no axis minitabs / invert switches yet); widget renders with the default axis mapping and invert off
- [ ] `GForceRenderer.test.jsx` asserts SVG attributes for a known fixture+previewSecond, including the no-data case
- [ ] Vitest parity test reads the fixture from ticket 01 and asserts JSX `max_g` matches the fixture's `expected max_g`
- [ ] `WidgetPreview-dispatch.test.jsx` gains a `display_type === 'g_force'` clause
- [ ] `npx vitest run` is green from inside `app/`

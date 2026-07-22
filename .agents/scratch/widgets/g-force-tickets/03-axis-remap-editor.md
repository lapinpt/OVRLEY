# 03 — Axis remap editor with minitabs, invert switches, and exclusivity

**What to build:**

The user can change which `g_force_*` axis drives the horizontal and vertical screen directions of the dot, invert each axis independently, and see the preview update immediately — with no backend IPC round-trip on axis/invert edits — and the editor prevents the user from collapsing the plot to a degenerate diagonal by silently rejecting a same-axis assignment.

Implement `features/widget-editor/components/GForceWidgetEditor.jsx` and wire it into the editor dispatch keyed by `display_type === 'g_force'` (the same keyed-by-display-type mechanism that already routes other display types). The component composes the standard metric-widget controls (already wired in ticket 02) with the new axis controls section.

Axis controls section:
- Two rows side-by-side, each composed of a shadcn/ui minitab group (`[X|Y|Z]`) and a shadcn/ui Switch:
  - Row labelled "Horizontal axis": minitabs bound to `axis_horizontal`; switch labelled "Invert" bound to `invert_horizontal`. Default selected tab `X`, default switch off.
  - Row labelled "Vertical axis": minitabs bound to `axis_vertical`; switch labelled "Invert" bound to `invert_vertical`. Default selected tab `Y`, default switch off.
- Exclusivity rule: when the user selects an axis for one row, that tab is visually greyed out and unselectable in the OTHER row. The disabled tab carries a tooltip "Already used for Horizontal" or "Already used for Vertical" on hover. Selecting an axis in row 1 must NOT modify the existing selection in row 2; it only disables that one tab in row 2 (i.e. if row 2 still has a valid distinct axis, its selection sticks; if row 2's selection was the now-taken axis, the editor's disable-only contract means the user must explicitly pick another — alternatively the disable contract is symmetric and the already-taken axis simply cannot be tapped, intent: forbid the collision, not auto-repair it).

Invert switch semantics: a Switch (not a checkbox) component from `app/src/components/ui/`. The switch is orthogonal state to the axis selection; toggling invert does not change which axis tab is selected. Invert is applied at the series-read stage in both render paths — the change flows through the store into both `OverlayGForceWidget` (preview) and the Rust render config, each rebuilding its cache on the change.

Config flow: `axis_horizontal` / `axis_vertical` / `invert_horizontal` / `invert_vertical` are stored in the widget's `data` block (inside the display-variant data for `g_force`). Updates use the existing store update path (no special editor state); the preview's `useGForcePreview.js` hook already reads these fields (ticket 02) and recomputes `max_g` when they change. The cache rebuild on any config-change rule established in ticket 01 covers the cross-render-path consistency.

Editor tests added in this ticket:
1. Editor exclusivity: render `GForceWidgetEditor` with default state, click `[X]` in the "Vertical axis" row (disabled under default config since `X` is already used horizontally), assert the click does NOT change `axis_vertical` and the tab carries the disabled affordance and tooltip. Click `[Y]` in the "Horizontal axis" row, assert `axis_horizontal` becomes `"y"` and the `Y` tab in the vertical row becomes disabled.
2. Invert propagation: render the editor with `invert_horizontal: false`, toggle the "Invert" switch in the horizontal row, assert `updateWidgetData` is called with `invert_horizontal: true`. Render the preview with the updated config and assert the dot's horizontal position is sign-flipped versus the un-inverted baseline at a known previewSecond.
3. Live preview update: change `axis_horizontal` from `"x"` to `"z"` in the editor and assert the preview recomputes `max_g` and dot position WITHOUT a backend IPC call.

Demoable in the running dev app: `pnpm dev:frontend`, select a `g_force` metric widget with display type G-Force, click the `Z` minitab in the horizontal row, watch the preview update immediately with the new axis mapping; toggle an invert switch and watch the dot flip sides; try to pick the same axis in both rows and confirm the second pick is blocked.

**Blocked by:** 02 — JSX preview renders the G-Force display type in the running app with default config.

**Status:** ready-for-agent

- [ ] `GForceWidgetEditor.jsx` exposes two axis rows (shadcn/ui minitabs `[X|Y|Z]`) and two shadcn/ui Switch components for invert; standard layout/paint controls from ticket 02 remain composed in
- [ ] Editor dispatch routes `display_type === 'g_force'` to `GForceWidgetEditor`
- [ ] Exclusivity: selecting an axis for one row greys out + tooltips ("Already used for …") that tab in the other row and the click is rejected; the existing selection in the other row is not silently rewritten
- [ ] Invert switches use shadcn/ui Switch (not checkbox); toggling flows through `updateWidgetData(field:"invert_horizontal"/"invert_vertical", value:true/false)`
- [ ] `axis_horizontal` / `axis_vertical` / `invert_horizontal` / `invert_vertical` are stored in the widget's `g_force` display-variant data; updates use the existing store update path
- [ ] Changing axis or invert in the editor updates the JSX preview immediately via the `useGForcePreview` hook, with no backend IPC round-trip
- [ ] The Rust config path also rebuilds its cache on axis/invert changes (covered by the ticket-01 cache-rebuild rule; this ticket records the wiring is correct from the editor side)
- [ ] Editor test asserts exclusivity behaviour (click on disabled tab is rejected with tooltip present)
- [ ] Editor test asserts invert switch toggling calls `updateWidgetData` with the correct field and value, and the preview's dot position flips sign
- [ ] Editor test asserts preview updates `max_g` and dot position on axis remap WITHOUT invoking any g-force IPC call
- [ ] `npx vitest run` is green from inside `app/`

# 04 — Moveable resize handlers scale every g-force dimension uniformly

**What to build:**

When the user drags a moveable resize handle on a selected g-force widget, every dimensional field in the widget scales uniformly with the resize gesture — not just `width` and `height`. The widget frame stays square (1:1 aspect ratio) so the circular instrument never stretches into an ellipse.

This ticket adds a g-force-specific content-scaling policy alongside the existing gauge policies in the resize/scale framework (currently `widgetResizeScaling.js`). The existing moveable resize and intrinsic-scale handlers (`useResizeHandlers.js`, `useScaleHandlers.js`) already support per-widget content drafts via `captureResizeOrigin` / `buildResizeUpdate` / `buildScaleDraft`, so this ticket extends the framework rather than introducing a new interaction path.

Fields that scale on resize (and on intrinsic-scale gestures):
- `width`, `height`, `diameter` (the frame stays square and the circle scales with it)
- `border_thickness`
- `dot_size`
- `text_font_size`
- `text_offset_x`, `text_offset_y`

Fields that are NOT scaled (configuration, not geometry):
- Colors, opacities, `text_unit`, `text_decimals`, `clip_percentile`
- `axis_horizontal`, `axis_vertical`
- `invert_horizontal`, `invert_vertical`

Scaling semantics: the uniform scale factor is the average of the width-scale and height-scale (matches the existing `getResizeScaleFactor`). Because the widget is a circle, the resizable frame is constrained to a square aspect ratio during the drag — corner-only resize handles with edge handles suppressed, matching the existing gauge pattern. Each dimensional field is multiplied by the scale factor, rounded on commit (`round: true`), and clamped to a sensible minimum so a tiny resize can't produce zero font size or zero dot size.

The Rust render path needs no new scaling policy: it reads whatever dimensional values the editor commits and renders them.

Demoable in the running dev app: `pnpm dev:frontend`, drop a `g_force` metric widget with display type G-Force, drag a corner resize handle inward/outward, and confirm the parent circle, border, dot, and bottom-right text all scale together — the dot's position relative to the circle edge stays the same percentage of the (now resized) radius, and the text stays inside the bottom-right corner at the same relative position. Confirm the frame stays square and does not stretch. Apply the same via the intrinsic-scale gesture (if separate from resize in this codebase) and confirm identical proportional results.

**Blocked by:** 02 — JSX preview renders the G-Force display type in the running app with default config.

**Status:** ready-for-agent

- [ ] G-force content-scaling policy added in `widgetResizeScaling.js` alongside the existing gauge policies
- [ ] `captureResizeOrigin` for a g-force widget captures the dimensional fields that need scaling (`width`, `height`, `diameter`, `border_thickness`, `dot_size`, `text_font_size`, `text_offset_x`, `text_offset_y`)
- [ ] `buildResizeUpdate` for a g-force widget scales every listed dimensional field by the uniform scale factor (average of width- and height-scale), rounded on commit, clamped to sensible minimums (e.g. `dot_size >= 1`, `text_font_size >= 8`, `diameter >= 8`)
- [ ] `buildScaleDraft` path produces the same proportional result as the moveable resize handle for the same scale factor
- [ ] G-force widget is configured with corner-only resize handles and a locked 1:1 aspect ratio, matching the existing gauge pattern (so the widget cannot be dragged into a non-square frame that breaks the circular instrument)
- [ ] Non-geometric fields (colors, opacities, `text_unit`, `text_decimals`, `clip_percentile`, `axis_horizontal`, `axis_vertical`, `invert_horizontal`, `invert_vertical`) are NOT modified by resize
- [ ] Existing tests for `widgetResizeScaling` gain a g-force case asserting each listed field scales by the expected factor and non-listed fields are untouched
- [ ] `npx vitest run` is green from inside `app/`

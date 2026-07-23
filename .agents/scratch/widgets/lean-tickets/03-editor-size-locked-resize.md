# 03 — Lean Angle editor single Size control and aspect-ratio-locked resize

**Master spec:** lean-spec.md

**What to build:**

In the editor, a lean-angle widget resizes as a single locked aspect ratio, and the property panel exposes one "Size" control instead of separate Width and Height inputs. All geometric content scales uniformly with the frame.

Add the `lean_angle` display type to the existing uniform-resize policy set in the editor's resize/scale framework (alongside the existing `arc` and `corner` gauge policies). The widget's default frame ratio is 180:140; when the user drags a moveable resize handle, the frame must stay in that ratio. The resize interaction can use corner handles only so the aspect ratio is naturally preserved, matching the existing gauge pattern.

When the frame is resized, scale the following fields by the same uniform factor:

- `track_thickness`
- `track_border_thickness`
- `font_size`
- `value_offset_x`
- `value_offset_y`

Do NOT scale colours, opacities, `show_units`, `show_icon`, `prefix`, `suffix`, `opacity`, or `display_type`.

The editor property panel for the lean-angle display type should show a single "Size" field. Changing Size updates both `width` and `height` while preserving the 180:140 ratio. The underlying saved config still stores `width` and `height`; this is a UI-only simplification. The Size value can be represented as the current width (or as a percentage of default); whichever representation is chosen, it must round-trip cleanly through `width`/`height`.

Tests added in this ticket assert: resizing the widget keeps `width / height === 180 / 140`; the scaled fields (`track_thickness`, `track_border_thickness`, `font_size`, `value_offset_x`, `value_offset_y`) are multiplied by the same scale factor; non-scaled fields are unchanged; the property panel renders a Size control and does not render separate Width/Height controls for the lean-angle display type; changing Size updates both dimensions.

Demoable in the running dev app: `pnpm dev:frontend`, select a lean-angle widget, drag a corner resize handle, and confirm the sector stays in proportion while the track thickness, border thickness, and centre text all scale together. Open the property panel and confirm only a "Size" control is shown; changing it resizes the widget without distorting the sector.

**Blocked by:** 01 — Lean Angle display type, icon, and static sector render end-to-end.

**Status:** ready-for-agent

- [ ] `lean_angle` added to the gauge/uniform-resize policy set used by the editor resize framework
- [ ] Resize handler enforces 180:140 aspect ratio for lean-angle widgets
- [ ] Corner-only resize handles used for lean-angle widgets so aspect ratio is preserved during drag
- [ ] `track_thickness`, `track_border_thickness`, `font_size`, `value_offset_x`, and `value_offset_y` scale uniformly with the frame
- [ ] Non-geometric fields are left unchanged by resize
- [ ] Property panel shows a single "Size" control instead of Width/Height for lean-angle widgets
- [ ] Size control updates both `width` and `height` while preserving 180:140
- [ ] Resize test asserts aspect ratio is preserved and scaled fields scale uniformly
- [ ] Editor UI test asserts Size control is present and Width/Height inputs are absent for lean-angle
- [ ] `npx vitest run` is green from inside `app/`

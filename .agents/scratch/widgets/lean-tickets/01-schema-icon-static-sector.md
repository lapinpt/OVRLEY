# 01 — Lean Angle display type, icon, and static sector render end-to-end

**Master spec:** lean-spec.md

**What to build:**

The `lean_angle` display type is discoverable in the widget drawer for the `lean_angle` metric, and selecting it renders a correct static 120° top-frown annular sector with border in both the frontend preview and the Rust renderer. The empty track+border are cached once in Rust; the frontend preview renders the equivalent static SVG path.

Add the `lean_angle` display-type definition under `displayTypes.definitions` in `assets/standard-metrics.json`, with the full config block from the spec: `layoutMode: "boxed"`, `defaultFrameWidth: 180`, `defaultFrameHeight: 140`, and defaults for `display_type`, `show_icon`, `track_empty_color`, `track_empty_opacity`, `track_filled_color`, `track_filled_opacity`, `track_border_thickness`, `font_size`, `track_border_color`, `track_thickness`, `font`, `color`, `unit_color`, `show_units`, `value_offset_x`, `value_offset_y`. Update the `lean_angle` metric override to `["text", "lean_angle"]` so the display type is only available for that metric.

Create `assets/widget-icons/display-type-lean-angle.svg` depicting only an annular sector, and register it in the frontend display-type icon map alongside the existing `arc`, `corner`, `linear`, and `heading_tape` icons.

On the Rust side, add a `DisplayType::LeanAngle` variant to the `DisplayType` enum and return `Boxed` from `display_type_layout_mode`. Implement a dedicated lean-angle path mirroring `heading_tape`: a validation module producing `ValidatedLeanAngleWidget`, a `PreparedValue::LeanAngle` variant, a `PresentationCache::LeanAngle` variant holding the pre-rendered empty track+border primitive, and a `prepare` step that builds the cache. The prepare step derives the circle centre from the widget frame and computes the outer radius so the 120° top-frown sector fits; the inner radius is `outer_radius - track_thickness`. The static layer is an annular sector path from 210° to 330° (Skia/SVG clockwise convention, centred on 270° upward vertical) with the configured empty colour/opacity and border stroke.

On the frontend, implement a dedicated preview module under `features/widget-preview/widgets/lean-angle/` with a presentation component and a model hook. The preview renders the same 120° top-frown annular sector as an SVG `<path>` using the configured empty colour/opacity and border stroke. The preview module is wired into `WidgetPreview.jsx` via a `widget.data.display_type === 'lean_angle'` clause.

This ticket does NOT yet draw the dynamic fill or the centre value text; those are ticket 02. It does NOT yet change the editor resize behaviour; that is ticket 03.

Rust geometry tests added in this ticket assert: the sector spans 120° centred on the upward vertical axis; the circle centre is at the frame centre; the outer radius fits inside the 180×140 default frame with margin; the inner radius respects `track_thickness`; the cached static primitive includes the empty track and border. Frontend SVG preview tests assert: the rendered SVG contains an empty-track `<path>` with the expected `d`, `fill`, `fill-opacity`, `stroke`, and `stroke-width` attributes for the default config.

Demoable in the running dev app: `pnpm dev:frontend`, add a `lean_angle` metric widget, change its display type to "Lean Angle", and see the empty top-frown sector appear in the preview. In the Rust render path, `cargo test` verifies the cache and geometry.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `lean_angle` display-type definition added to `assets/standard-metrics.json` with the full defaults block and `defaultFrameWidth: 180`, `defaultFrameHeight: 140`
- [ ] `lean_angle` metric override updated to `["text", "lean_angle"]`
- [ ] `display-type-lean-angle.svg` icon asset created and registered in the frontend display-type icon map
- [ ] Rust `DisplayType::LeanAngle` variant added and returns `Boxed` layout mode
- [ ] Rust validation module, `PreparedValue::LeanAngle`, `PresentationCache::LeanAngle`, and `prepare` step implemented, caching the empty track+border primitive
- [ ] Frontend dedicated preview module renders the static 120° top-frown annular sector as an SVG `<path>`
- [ ] `WidgetPreview.jsx` dispatches `display_type === 'lean_angle'` to the new preview component
- [ ] Rust geometry tests verify sector angle span, centre, radius, and track thickness
- [ ] Frontend SVG preview test verifies the empty-track path attributes for the default config
- [ ] `cargo test --manifest-path src-tauri/ovrley_core/Cargo.toml` is green
- [ ] `npx vitest run` is green from inside `app/`

# 02 — Lean Angle bidirectional fill sweep and centre value text

**What to build:**

The lean-angle gauge animates: the fill sector sweeps left or right from the upward vertical centre according to the sign of the signed `lean_angle` value, with sweep magnitude equal to `abs(lean_angle)` clamped to 60°. The absolute integer lean angle, followed by the degree unit when `show_units` is true, is rendered at the circle centre. Missing data renders `--` with zero fill.

In both Rust and JSX, read the interpolated signed `lean_angle` sample for the current frame. Compute `display_value = abs(raw)` and format it as an integer with no decimals using the existing `lean_angle` metric formatter. Compute `sweep_magnitude = min(abs(raw), 60)`. If `raw` is positive, the fill sector extends from the centre vertical (270°) toward the right boundary (330°) by `sweep_magnitude` degrees. If `raw` is negative, it extends toward the left boundary (210°). When `raw` is zero or null, the fill sector has zero sweep and is not visible. The fill sector shares the same inner/outer radius as the empty track and uses the configured `track_filled_color` and `track_filled_opacity`.

Draw order per frame: cached empty track+border (from ticket 01) → dynamic fill sector → value text. The fill has flat end caps (no corner radius).

For the centre text, position it at the circle centre plus `value_offset_x`/`value_offset_y`. Render the integer value and, when `show_units` is true, the `°` unit inline to the right of the value using the same unit-sizing convention as the standard text widget (unit font size scales with value font size). Use `font`, `font_size`, `color`, and `unit_color` from the widget config. Missing data (`raw` is `None`) renders `--` instead of a number; the unit is not shown in the missing-data case.

Rust tests added in this ticket assert: a positive `lean_angle` produces a rightward fill sweep; a negative value produces a leftward sweep; `30°` produces a `30°` sweep; `70°` produces a `60°` sweep (clamped); `0°` produces zero fill; a null sample produces zero fill and `--` text; the displayed text is the absolute integer value; the unit appears when `show_units` is true and is hidden when false.

Frontend SVG preview tests assert: the fill `<path>` has the expected sweep direction and angle for positive/negative known values; the text `<text>` contains the absolute integer value plus the unit for a known fixture+previewSecond; the no-data case renders `--` with no fill path visible.

Demoable in the running dev app: `pnpm dev:frontend`, select a lean-angle widget, scrub the activity timeline, and watch the sector fill sweep left/right in sync with the signed lean angle while the centre text shows the positive integer angle.

**Blocked by:** 01 — Lean Angle display type, icon, and static sector render end-to-end.

**Status:** ready-for-agent

- [ ] Signed `lean_angle` → fill sweep direction/magnitude mapping implemented in Rust
- [ ] Signed `lean_angle` → fill sweep direction/magnitude mapping implemented in JSX preview
- [ ] Rust per-frame draw renders the dynamic fill sector on top of the cached empty track+border
- [ ] JSX preview renders the dynamic fill sector on top of the static empty-track SVG path
- [ ] Centre value text rendered at circle centre plus `value_offset_x`/`value_offset_y` in Rust
- [ ] Centre value text rendered at circle centre plus `value_offset_x`/`value_offset_y` in JSX
- [ ] Value formatted as `abs(raw)` integer with hardcoded `decimals = 0`; unit `°` rendered inline to the right when `show_units` is true
- [ ] Missing data renders `--` with zero fill; unit hidden in missing-data case
- [ ] Rust mapping tests cover positive/negative direction, clamping at 60°, zero value, and null
- [ ] Frontend SVG preview tests cover fill direction/magnitude, text content, and missing data
- [ ] `cargo test --manifest-path src-tauri/ovrley_core/Cargo.toml` is green
- [ ] `npx vitest run` is green from inside `app/`

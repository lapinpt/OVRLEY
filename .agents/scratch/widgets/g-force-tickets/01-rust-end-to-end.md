# 01 — G-Force display type renders a correct frame end-to-end on the Rust path

**What to build:**

The Rust backend can render a complete G-Force display type frame for any sample of a known activity, producing the dot, text, and parent circle identical to what the JSX preview will later mirror.

Add the display-type definition under `displayTypes.definitions.g_force` in `assets/standard-metrics.json` with the full config block from the spec (geometry/paint/dot/axis-mapping/text/`clip_percentile`). Update the `g_force` metric override to `["text", "g_force"]`. Implement the Rust render module under `render/widgets/g_force/` mirroring the ownership split used by the existing `heading_tape` special display type (normalize, prepare, frame-state, draw as appropriate to the triviality of each piece).

Add a `DisplayType::GForce` variant to the Rust enum and return `Boxed` from `display_type_layout_mode`. Implement validation producing `ValidatedGForceWidget`, a `PreparedValue::GForce` variant, a `PresentationCache::GForce` variant holding the pre-rendered parent circle primitive, and a `prepare` step that builds the cache and derives `max_g`.

The Rust widget reads the activity's canonical `g_force_x`/`g_force_y`/`g_force_z` series only (no aliases, no remapping; the existing `g_force` magnitude series is NOT used because it includes the z component that this widget drops). Invert is applied at the series-read stage before interpolation and before `max_g` computation. Linear interpolation between samples at the activity's `sample_elapsed_seconds` timestamps.

Compute `max_g` as the `clip_percentile`th percentile (default 99) of the radial magnitude `√(h² + v²)` over the activity samples for the user-selected axis pair (with invert applied). This value rides on the `GForceWidgetCache` alongside the pre-rendered parent circle primitive (Skia image).

Per-frame render: read cache, interpolate `(h, v)`, render the dot at `cx + (h/max_g)·radius`, `cy + (v/max_g)·radius` clamped to `radius`, render the text label as `format_with_decimals(√(h² + v²), text_decimals)` + `" G"` using the existing decimal formatter in `render/format.rs`. Missing data (series absent OR per-sample null) renders the dot at centre and the text "--". Zero magnitude ("0.0 G" with dot at centre) is a normal value distinct from missing data.

This ticket also establishes the **fixture**: a JSON file under `src-tauri/ovrley_core/tests/fixtures/g_force/` containing `g_force_x`/`g_force_y`/`g_force_z` sample arrays (with at least one null sample), an axis-horizontal / axis-vertical / clip-percentile configuration, and the hand-computed expected `max_g` value.

Rust frame-state tests under `src-tauri/ovrley_core/src/render/widgets/tests/` (new file matching the elevation frame-state test pattern) assert: cache `max_g` matches the fixture, per-frame dot position matches the closed-form for known samples, clamp fires when the sample exceeds `max_g`, invert sign-flips the dot, axis remapping uses the correct series, missing series → dot at centre + "--" text, null sample → dot at centre + "--" text. The fixture is consumed by one Rust test asserting the computed `max_g` matches the expected value exactly.

Demoable via `cargo test` (or `cargo test --manifest-path src-tauri/ovrley_core/Cargo.toml`): all g-force tests pass against the fixture.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Display-type definition under `displayTypes.definitions.g_force` in `assets/standard-metrics.json` carries the full config block from the spec (diameter/paint/dot/axis-mapping/text/`clip_percentile`)
- [ ] `g_force` metric override updated to `["text", "g_force"]`
- [ ] Rust `DisplayType::GForce` variant added and returns `Boxed` layout mode
- [ ] Rust render module under `render/widgets/g_force/` reads only `g_force_x`/`g_force_y`/`g_force_z`; applies invert at series-read; uses linear interpolation; does not consult the `g_force` magnitude series
- [ ] `GForceWidgetCache` holds the pre-rendered parent circle primitive AND the derived `max_g` (percentile of `√(h²+v²)` over the user-selected, invert-applied axis pair)
- [ ] Per-frame draw renders dot at clamped closed-form position, text label through the existing `render/format.rs` decimal formatter with `" G"` suffix, parent circle from cache
- [ ] Missing-data (absent series or per-sample null) renders dot at centre + text "--"; zero magnitude renders dot at centre + text "0.0 G"
- [ ] Cache rebuilds on any widget config change OR activity change
- [ ] Fixture committed under `src-tauri/ovrley_core/tests/fixtures/g_force/`
- [ ] Rust frame-state tests pass against the fixture and cover: `max_g` value, dot position, clamp, invert, axis remap, missing series, null sample, zero magnitude
- [ ] `cargo test --manifest-path src-tauri/ovrley_core/Cargo.toml` is green

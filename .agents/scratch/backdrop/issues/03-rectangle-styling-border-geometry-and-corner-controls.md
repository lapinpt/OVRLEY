Status: ready-for-agent

# Rectangle styling, border geometry, and corner controls

## Parent

PRD: `.agents/scratch/backdrop/PRD.md`
Spec: `.agents/scratch/backdrop/spec.md`

## What to build

Complete rectangle backdrop editing and rendering. Users should be able to configure fill color, fill opacity, border thickness, border color, border opacity, overall opacity, width, height, corner radius, and individual rounded corners. The preview and Rust renderer should agree on total-size semantics: configured width and height are the outer visual bounds, with the border drawn outside the fill with no overlap and no gap.

The rectangle editor should use the agreed compact layout: shared styling controls plus a rectangle-specific section with a 2-by-2 visual corner grid and corner-radius control beside it. Validation should reject malformed styling values and dimensions while preserving the specified crash-prevention and UX clamps.

## Acceptance criteria

- [ ] Rectangle editor controls update fill color, fill opacity, border thickness, border color, border opacity, and top-level opacity on the backdrop's shared fields.
- [ ] Rectangle editor controls update width, height, corner radius, and each per-corner rounding flag on the active rectangle display variant.
- [ ] The per-corner rounding control is a spatial 2-by-2 clickable grid, not four standalone text-heavy toggles.
- [ ] Frontend rectangle preview renders fill and border with alpha composition equivalent to `color alpha * element opacity * widget opacity`.
- [ ] Rust rectangle rendering matches preview semantics for fill, border, top-level opacity, and total outer dimensions.
- [ ] Border thickness of zero disables the border without affecting fill rendering.
- [ ] The validator rejects missing styling fields, invalid hex colors, out-of-range opacity values, non-positive width/height, negative border thickness, and border thickness that cannot fit within the rectangle dimensions.
- [ ] Rectangle corner radius is rejected when negative, crash-clamped to half the smaller dimension, and clamped down to border thickness only for rounded corners when the agreed condition applies.
- [ ] Tests cover rectangle validation failures, accepted/clamped rectangle validation output, resolver/editor updates for shared and rectangle-specific fields, and corner-grid user interactions.

## Blocked by

- `.agents/scratch/backdrop/issues/02-default-rectangle-backdrop-creation-and-layering.md`

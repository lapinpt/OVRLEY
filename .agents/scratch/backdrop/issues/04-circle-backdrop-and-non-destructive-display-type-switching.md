Status: ready-for-agent

# Circle backdrop and non-destructive display-type switching

## Parent

PRD: `.agents/scratch/backdrop/PRD.md`
Spec: `.agents/scratch/backdrop/spec.md`

## What to build

Add the circle backdrop display type and make backdrop display-type switching non-destructive. Users should be able to switch a backdrop between rectangle and circle from the editor, keep shared styling and position intact, and recover each shape's previous geometry when switching back.

Circle backdrops should use `diameter` as the total outer visual size, with `x` and `y` representing the top-left of the circle's bounding box. The preview and Rust renderer should agree on fill, border, opacity, and total-size semantics.

## Acceptance criteria

- [ ] The backdrop editor exposes a display-type dropdown sourced from the shared backdrop type definitions.
- [ ] Switching to circle lazily seeds `display_variants.circle` from manifest defaults only when the circle variant is absent.
- [ ] Switching display type preserves shared styling, position, overall opacity, and all existing inactive display variants.
- [ ] Switching from rectangle to circle and back restores the previous rectangle geometry and corner settings.
- [ ] Circle editor controls update `diameter` on the active circle display variant.
- [ ] Frontend preview renders circle fill and border with the same alpha composition as rectangle backdrops.
- [ ] Rust circle rendering treats `diameter` as the total outer visual size and draws the border/fill without overlap or gap.
- [ ] The validator rejects missing or non-positive circle diameter, invalid styling fields, out-of-range opacity values, negative border thickness, and border thickness that cannot fit within the circle diameter.
- [ ] Unknown/null backdrop display types fail strictly at deserialization instead of falling back to rectangle or text behavior.
- [ ] Tests cover non-destructive display-type switching, lazy circle variant initialization, active backdrop data resolution for both shapes, circle validation failures, and circle preview/render dispatch.

## Blocked by

- `.agents/scratch/backdrop/issues/02-default-rectangle-backdrop-creation-and-layering.md`
- `.agents/scratch/backdrop/issues/03-rectangle-styling-border-geometry-and-corner-controls.md`

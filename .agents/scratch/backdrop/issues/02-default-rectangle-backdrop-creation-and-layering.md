Status: ready-for-agent

# Default rectangle backdrop creation and layering

## Parent

PRD: `.agents/scratch/backdrop/PRD.md`
Spec: `.agents/scratch/backdrop/spec.md`

## What to build

Make the default rectangle backdrop usable end to end in the editor and render pipeline. A user should be able to add a Backdrop from the widget drawer, receive a rectangle backed by the shared manifest defaults, drag/select it on the canvas, see it listed before other widgets in the sidebar, and get the same lowest-layer rectangle in preview and exported video renders.

This slice should focus on the minimum rectangle path: creation, template storage, widget flattening, basic rectangle preview/render, canvas z-order, moveable selection, and static-cache integration. Rich styling controls, border geometry, and per-corner rounding are handled by the next issue.

## Acceptance criteria

- [x] The widget drawer includes a Backdrop entry in the general group and creates a rectangle backdrop using the manifest default display type.
- [x] Newly created backdrops store shared fields at the top level and rectangle geometry under the active display variant.
- [x] Template normalization preserves valid backdrop fields and treats a missing `backdrops` section as an empty list.
- [x] Flattened widget presentation emits backdrops first so the sidebar lists them above labels, values, and plots.
- [x] The overlay canvas assigns backdrops the lowest widget z-layer while keeping them selectable and draggable through the existing moveable handle flow.
- [x] The frontend preview renders a basic rectangle backdrop from resolved active backdrop data.
- [x] The Rust render path draws backdrops into the shared static image before labels and icons.
- [x] The static cache key includes backdrops so changing, adding, or removing a backdrop invalidates the cached static image.
- [x] A rectangle backdrop appears in exported video renders in the same position and behind the same widgets as it does in the editor preview.
- [x] Focused tests cover drawer creation/default shape, widget ordering, preview dispatch, and static render config/cache integration where existing test seams allow it.

## Blocked by

- `.agents/scratch/backdrop/issues/01-shared-backdrop-manifest-and-config-contract.md`

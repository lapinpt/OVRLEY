Status: ready-for-agent

# Shared backdrop manifest and config contract

## Parent

PRD: `.agents/scratch/backdrop/PRD.md`
Spec: `.agents/scratch/backdrop/spec.md`

## What to build

Establish the shared frontend/Rust contract for backdrop widgets without changing the visible editor experience yet. The widget manifest should use the uniform `definitions` shape for existing widget sections and add a `backdrops` section with rectangle as the default display type and circle/rectangle definitions.

The Rust backend should load the widget manifest through the same shared-loader pattern already used for metric metadata. Add the strict backdrop display-type enum, raw backdrop template shape, validated backdrop output shape, top-level `backdrops` template field, and validation dispatch plumbing so templates without backdrops continue to load as an empty backdrop list.

This slice should leave rendering and editor controls to follow-up issues, but it must make the shared contract testable from both sides.

## Acceptance criteria

- [x] The widget manifest uses `{ definitions: { ... } }` for existing plot, gradient, and label sections while preserving their existing defaults.
- [x] The manifest contains `backdrops.defaults` with rectangle as the default display type and definitions for `circle` and `rectangle`.
- [x] The Rust backend loads `standard-widgets` from the shared manifest with an include-time loader and accessor helpers parallel to the existing metric manifest loader.
- [x] A strict backdrop display-type enum supports `circle` and `rectangle`, defaults to rectangle only where an explicit default is needed, and rejects unknown/null serialized values.
- [x] Raw render config accepts a top-level `backdrops` array that defaults to empty when omitted.
- [x] Validated render config exposes validated backdrops in parallel with labels, values, and plots.
- [x] Backdrop styling fields are required by validation rather than silently defaulted by the backend.
- [x] Tests cover manifest parsing, expected backdrop keys/defaults, strict display-type deserialization, and existing-template compatibility with missing `backdrops`.

## Blocked by

None - can start immediately.

# Optimization implementation plan

1. Scrubbing cadence

Owner: `usePlaybackEngine`

Relevant files:

- `app/src/features/player/hooks/usePlaybackEngine.js` — owns scrub scheduling, playhead derivation, RAF cleanup, and final synchronous commit.
- `app/src/features/player/hooks/useTimelineGestures.js` — owns axis/playhead pointer handlers and forwards move, commit, and cancel commands.
- `app/src/features/player/hooks/useOverlayPlayer.js` — wires playback commands into timeline gestures, including any new scrub-cancel command.
- `app/src/store/slices/createEditorSlice.js` — owns `selectedSecond` and preview-scrub state transitions/equality guards.
- `app/src/tests/features/player/usePlaybackEngine.test.jsx` — RAF coalescing and synchronous pointer-up coverage.
- `app/src/tests/features/player/useTimelineGestures.test.jsx` — existing pointer forwarding coverage, extended only if cancel wiring changes.
- `app/src/tests/store/editor-slice-transient.test.js` — selected-second equality-guard coverage.

- Remove redundant `dragSecond`; `selectedSecond` remains the canonical playhead.
- Store the latest clamped pointer value in a ref.
- Schedule one RAF to publish that value through `beginPreviewScrub` or `updatePreviewScrub`.
- On `commitScrub`, cancel the pending RAF and synchronously publish the final value through `commitPreviewScrub`.
- Cancel pending work on pointer-cancel and hook cleanup.
- Add equality guards to `setSelectedSecond` and scrub update actions, while preserving transitions between `paused`, `scrubbing`, and `playing`.
- Keep `useTimelineGestures` as the pointer-event owner; it should continue forwarding every pointer sample to the scheduling command.

Minimal tests:

- Expand `usePlaybackEngine.test.jsx` to cover:
  - several scrub samples before one RAF collapse to the latest value;
  - live updates still occur once per RAF;
  - pointer-up commits immediately and prevents a stale RAF update.
- Only adjust `useTimelineGestures.test.jsx` if adding the pointer-cancel command requires coverage.

2. Static route/elevation geometry

Owners: `useRoutePreviewGeometry`, `useElevationPreviewGeometry`

Relevant files:

- `app/src/features/widget-preview/widgets/route/useRoutePreviewGeometry.js` — route IPC boundary, projected-point memoization, remaining path, and dynamic completed path.
- `app/src/features/widget-preview/widgets/route/useRoutePreview.js` — route style/geometry composition and output contract.
- `app/src/features/widget-preview/widgets/elevation/useElevationPreviewGeometry.js` — elevation IPC boundary, projected points, static paths/areas, and dynamic marker/completed geometry.
- `app/src/features/widget-preview/widgets/elevation/useElevationPreview.js` — elevation style/geometry composition, label derivation, and output contract.
- `app/src/features/widget-preview/shared/plotGeometry.js` — placeholder geometry behavior that must remain unchanged.
- `app/src/features/widget-preview/shared/svgPreviewUtils.js` — dynamic route/elevation completed-segment calculations.
- `app/src/lib/geometryUtils.js` — SVG path serialization helpers used by the hooks.
- `app/src/api/backend.js` — existing Rust geometry IPC owner; no per-frame dependency should be added here.
- `app/src/tests/features/widget-preview/useRoutePreviewGeometry.test.js` — route rerender/serializer assertions.
- `app/src/tests/features/widget-preview/useElevationPreviewGeometry.test.js` — elevation rerender/serializer assertions.

- Keep Rust IPC effects dependent only on geometry inputs.
- Memoize projected/scaled points.
- Memoize route remaining SVG points.
- Memoize elevation remaining SVG points and static area points using geometry, scale, and dimensions.
- Keep marker interpolation and completed-segment/polyline/area generation dependent on `previewSecond`.
- Preserve placeholder behavior and existing geometry output shapes.

Minimal tests:

- Expand the existing route and elevation geometry tests with one `rerender` case each.
- Verify:
  - changing only `previewSecond` does not call Rust IPC again;
  - static serializer work is not repeated;
  - dynamic completed output still changes.
- Do not add new fixtures or broad geometry cases.
- Record the four reported route/elevation failures as pre-existing baseline failures.

3. Shared metric/text models

Owner: a new `useOverlayPreviewModels` hook composed by `OverlayEditor`

Relevant files:

- `app/src/features/overlay-editor/hooks/useOverlayPreviewModels.js` — new parent-owned memoized model builder.
- `app/src/features/overlay-editor/hooks/useOverlayEditorState.js` — provides stable rendered widgets, activity, and canonical preview second to the editor.
- `app/src/features/overlay-editor/components/OverlayEditor.jsx` — composes the model hook, passes models to consumers, builds Moveable geometry signatures, and owns editor layout.
- `app/src/features/overlay-editor/components/OverlayCanvas.jsx` — consumes per-widget metric/text models and renders widget DOM bounds without rebuilding models.
- `app/src/features/widget-preview/WidgetPreview.jsx` — receives and dispatches the shared models to the appropriate renderer.
- `app/src/features/widget-preview/widgets/metric/model.js` — canonical intrinsic metric model builder.
- `app/src/features/widget-preview/widgets/text/model.js` — canonical label/text model builder.
- `app/src/features/widget-preview/widgets/metric/MetricPreview.jsx` — consumes the shared metric model in the intrinsic renderer.
- `app/src/features/widget-preview/widgets/text/TextPreview.jsx` — consumes the shared text model in the label renderer.
- `app/src/features/widget-preview/shared/useFontMetrics.js` — existing font readiness signal; extend it with the parent-visible invalidation mechanism required by lifted measurements.
- `app/src/features/widget-preview/index.js` — existing public model exports used by the editor.
- `app/src/tests/features/overlay-editor/OverlayEditor.selection.test.jsx` — minimal shared-model and static-label rerender coverage.
- `app/src/tests/features/widget-preview/metricWidgetPreviewModel.test.js` — existing metric model regression coverage.
- `app/src/tests/features/widget-preview/TextRenderer.test.jsx` — existing text renderer/model contract coverage.
- `app/src/tests/features/widget-preview/WidgetPreview-dispatch.test.jsx` — existing dispatch contract coverage.

- Build intrinsic metric models once for the current `activity` and `previewSecond`.
- Build label/text models separately, depending only on rendered widgets and font-metric invalidation.
- Pass stable per-widget model references through `OverlayCanvas` data props.
- Reuse those references in:
  - `OverlayCanvasWidget`;
  - `WidgetBadgeLayer`;
  - `selectedRenderedGeometryVersion`.
- Remove calls to `buildMetricWidgetPreviewModel` and `buildTextWidgetPreviewModel` from those three consumers.
- Avoid passing a newly created model-entry object to static widgets; pass the individual stable metric/text model reference so memo comparators remain effective.
- Preserve the existing font-loading behavior. Since measurements move above the widget component, provide a parent-visible font-metrics epoch/subscription. Existing font loaders publish the epoch, and `useOverlayPreviewModels` depends on it. Do not call hooks in a widget loop.
- Keep renderer fallbacks only where the renderer API explicitly documents model absence as optional.

Minimal tests:

- Expand `OverlayEditor.selection.test.jsx` with one static-label case:
  - render the editor;
  - change `selectedSecond`;
  - verify the label renderer does not rerender;
  - verify its text model is not rebuilt.
- Use spies in the existing widget-preview mock.
- Rely on existing metric/text model unit tests for formatting and measurement correctness.
- Do not add a separate performance benchmark suite.

4. Sole Moveable owner

Owner: `OverlayMoveable`

Relevant files:

- `app/src/features/overlay-editor/components/OverlayEditor.jsx` — computes and passes the selected geometry signature; remove its competing immediate `updateRect()` effect.
- `app/src/features/overlay-editor/components/OverlayMoveable.jsx` — sole owner of RAF-scheduled `updateRect()`.
- `app/src/features/overlay-editor/utils/widgetRenderGeometry.js` — computes render geometry and the signature used to decide whether Moveable needs updating.
- `app/src/features/overlay-editor/hooks/useWidgetSelection.js` — provides selected targets whose changes must still refresh Moveable.
- `app/src/tests/features/overlay-editor/OverlayEditor.selection.test.jsx` — existing intrinsic-size/selection assertion and Moveable mock.
- `app/src/tests/features/overlay-editor/OverlayMoveable.test.jsx` — add only if the existing mocked integration cannot exercise the actual RAF ownership seam.

- Remove the immediate `updateRect()` effect from `OverlayEditor`.
- Retain the geometry signature calculation in `OverlayEditor`, now using shared models.
- Keep the existing RAF-scheduled `updateRect()` effect in `OverlayMoveable`.
- Make its dependencies the geometry signature and selection state only.
- Retain RAF cancellation during cleanup.
- Ensure unchanged signatures do not schedule another update.

Minimal tests:

- Preserve the existing intrinsic-size assertion in `OverlayEditor.selection.test.jsx`.
- Because that suite mocks `OverlayMoveable`, update the mock to represent the RAF-owned behavior.
- Add a dedicated `OverlayMoveable` test only if the mock cannot verify the actual ownership seam; it should contain just:
  - one changed-signature update;
  - no update for an unchanged signature.

Validation remains the affected Vitest files plus lint. No build.

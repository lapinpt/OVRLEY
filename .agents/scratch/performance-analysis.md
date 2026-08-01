Conclusion: the concerns are mostly real, but one is overstated.

- Model duplication is confirmed. Canvas widgets compute preview models at app/src/
  features/overlay-editor/components/OverlayCanvas.jsx:148, badges recompute them at app/
  src/features/overlay-editor/components/OverlayEditor.jsx:43, and Moveable geometry
  recomputes them again at app/src/features/overlay-editor/components/
  OverlayEditor.jsx:279. Intrinsic metric/label widgets can therefore perform the same
  text measurement up to three times per frame. previewSecond also forces all widget
  wrappers through their memo comparators.

- The Moveable concern is only partly valid. The geometry signature is recalculated
  whenever previewSecond changes, but updateRect() runs only when the resulting signature
  actually changes at app/src/features/overlay-editor/components/OverlayEditor.jsx:299.
  However, the current code also schedules another updateRect() in app/src/features/
  overlay-editor/components/OverlayMoveable.jsx:67, so a genuine geometry change can
  trigger two calls.

- Route/elevation path rebuilding is confirmed, but only in JavaScript. Rust geometry IPC
  is not rerun per frame because its effect does not depend on previewSecond. However,
  route rescales and serializes all points at app/src/features/widget-preview/widgets/
  route/useRoutePreviewGeometry.js:88 and app/src/features/widget-preview/widgets/route/
  useRoutePreviewGeometry.js:101. Elevation does the same, including static area paths, at
  app/src/features/widget-preview/widgets/elevation/useElevationPreviewGeometry.js:102 and
  app/src/features/widget-preview/widgets/elevation/useElevationPreviewGeometry.js:131.

- Scrubbing writes on every pointer event. app/src/features/player/hooks/
  useTimelineGestures.js:92 and app/src/features/player/hooks/useTimelineGestures.js:165
  call scrubTo() directly. That updates both local dragSecond and Zustand’s selectedSecond
  at app/src/features/player/hooks/usePlaybackEngine.js:265. The store action has no
  equality guard at app/src/store/slices/createEditorSlice.js:206. This can rerender the
  player, editor, canvas, and video-preview subscribers. Normal playback already has
  frame-index deduplication, so this issue is specific to pointer scrubbing.

What should be fixed:

1. Coalesce scrub updates with requestAnimationFrame, flushing the final value
   synchronously on pointer-up. Update local and global playhead state together, or remove
   the redundant local state.

2. Memoize static route/elevation geometry: projected points, remaining paths, and area
   paths should be rebuilt only when geometry, scale, or dimensions change. Leave
   completed-segment paths dynamic.

3. Build metric/text models once per render cycle and share them between canvas, badge,
   and Moveable geometry. Also avoid rerendering static widgets when only previewSecond
   changes.

4. Make one component the sole owner of the post-layout Moveable.updateRect() call,
   preferably the existing RAF-scheduled path.

These are safe optimizations if implemented incrementally, with geometry and interaction
tests retained. Targeted tests currently pass for playback and selection, but the modified
worktree has four existing route/elevation test failures, so it is not presently a clean
validation baseline.

The widgets will still update while scrubbing, because selectedSecond remains the
canonical global playhead value.

The safe version is:

- Pointer events store the latest second.
- One requestAnimationFrame publishes that latest second to Zustand.
- Widget values rerender once per animation frame.
- Pointer-up flushes the final second synchronously.

This drops only intermediate pointer samples that could never be painted individually. It
must not coalesce updates only until pointer-up—that would prevent live widget updates.

If dragSecond is removed, selectedSecond must continue updating on each scheduled
animation frame.

ARCHITECTURAL DECISIONS:

Yes—four meaningful opportunities remain, though none is an immediate correctness blocker.

1. Make the activity interval canonical at ingress. Activity end is still derived
   differently from trim_end_seconds, the final elapsed sample, metadata duration, and
   activitySummary.durationSeconds. See src-tauri/ovrley_core/src/commands/mod.rs:238, src-
   tauri/ovrley_core/src/activity/trim.rs:140, and app/src/lib/preview-timing.js:25. This is
   the strongest next consolidation: normalize one activity interval and make every consumer
   trust it.
2. Introduce one canonical video timeline range. offset + duration is independently
   calculated in playback, fit targets, editor export preview, render dialog presets, and
   render configuration. Expand app/src/lib/video-timing.js:10 to own { start, end,
   duration }, then make overlap checks and consumers accept that range. This would also
   supersede the local getImportedVideoExportRange.
3. Promote timeline bounds to a first-class value. { timelineMinimum, totalDuration }
   travels together through viewport, geometry, gestures, and export-range APIs. app/src/
   features/player/utils/timelineViewport.js:19 already constructs this internally; passing a
   canonical { start, end, span } would remove the data clump and the many timelineMinimum =
   0 defaults.
4. Let the Rust composite plan own the dense-frame contract completely. Activity frame
   count is currently derived once while building the timeline and again when validating the
   dense report in src-tauri/ovrley_core/src/encode/pipeline/composite.rs:294. The plan could
   own activity_frame_count, and Fps could build a timeline from that count. Unlike the
   removed version, the count should stop at the pipeline boundary and not be threaded
   redundantly into VideoFrameRenderer.

I would tackle them in that order. The remaining compound conditions are justified, and I
found no obvious dead production exports or duplicate workflow that should simply be
deleted.

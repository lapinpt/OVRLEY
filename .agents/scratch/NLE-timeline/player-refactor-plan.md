# Player Feature Refactor Plan

## Goal

Refactor all of `app/src/features/player` so React component files are presentational and durable behavior lives in cohesive hooks and pure utilities. `OverlayPlayer.jsx` is the symptom: it currently owns store selection, playback orchestration, viewport state, resize/wheel handlers, timeline drag state, export-range projection, tab derivation, and rendering. The refactor should make those responsibilities explicit without replacing them with a forest of small files.

The refactor should preserve the existing NLE timeline behavior:

- playback source ownership remains shared with `features/video-preview` through `previewPlaybackState` and `previewPlaybackSource`;
- play, pause, reset, step, scrub, pan, zoom, fit, and export-marker drag keep the same user-visible behavior;
- no new store actions are required;
- tests move with the domain they verify.

## Current Shape

`app/src/features/player` currently has 12 files:

- 1 entrypoint: `index.js`
- 6 component files: `OverlayPlayer.jsx`, `TimelineAxis.jsx`, `TimelineExportMarkers.jsx`, `TimelineLane.jsx`, `TimelinePanSurface.jsx`, `TimelinePlayhead.jsx`
- 4 hook files: `usePlaybackEngine.js`, `usePlayerKeyboard.js`, `useTimelineDrag.js`, `useTimelineViewport.js`
- 1 utility file: `playerTimeline.js`

Main problems found:

- `OverlayPlayer.jsx` is a 410 LOC container plus view. It owns multiple unrelated domains.
- Several component files own behavior, not just presentation:
  - `TimelineExportMarkers.jsx` selects and writes store state, manages drag preview, converts time formats, and renders marker UI.
  - `TimelineAxis.jsx`, `TimelinePlayhead.jsx`, and `TimelinePanSurface.jsx` own pointer math and drag handling.
  - `TimelineLane.jsx` owns tooltip state, geometry decisions, and formatting.
- `useTimelineDrag.js` is a small generic primitive that encourages wiring logic into components.
- `usePlayerKeyboard.js` is a small hook whose only job is command routing. It should be folded into the player orchestration layer unless it grows into a durable command domain.
- Scrub handlers still use slider-shaped arrays such as `[second]`; the timeline should use second-based commands directly.
- `playerTimeline.js` has useful pure helpers, but it has grown into a utility grab bag with stale/comment-only residue and duplicated helpers that should be split by durable calculation domain.

## Target File Layout

Expected final feature layout:

```text
app/src/features/player/
  index.js
  components/
    OverlayPlayer.jsx
    PlayerToolbar.jsx
    TimelineLane.jsx
    TimelineSurface.jsx
  hooks/
    useExportRangeTimeline.js
    useOverlayPlayer.js
    usePlaybackEngine.js
    useTimelineClips.js
    useTimelineGestures.js
    useTimelineViewport.js
  utils/
    playerTiming.js
    timelineGeometry.js
    timelineViewport.js
```

This keeps the final count at 14 feature files:

- 4 presentational component files
- 6 hook files
- 3 pure utility files
- 1 public entrypoint

## Target Responsibilities

### Components

All component files receive already-shaped props and render markup. They should not select from the store, manage effects, maintain React state, convert time strings, compute geometry, or build callback behavior.

`components/OverlayPlayer.jsx`

- Public feature adapter used by `index.js`.
- Calls `useOverlayPlayer({ backgroundMode })`.
- Returns `null` or the shell markup plus `PlayerToolbar` and `TimelineSurface`.
- No selectors, `useMemo`, `useCallback`, `useEffect`, local state, or derived data beyond destructuring the hook result.

`components/PlayerToolbar.jsx`

- Renders zoom controls, fit target tabs, transport controls, and time display.
- Receives a toolbar view model:
  - `zoomOut`, `zoomIn`, `resetView`
  - `fitTargets`
  - `transport`
  - `timeLabel`
- Does not know where commands come from.

`components/TimelineSurface.jsx`

- Renders the timeline group, axis ticks, pan background, playhead, export markers, and lane stack.
- Receives prepared refs/handler props from `useTimelineGestures`.
- Receives prepared marker and playhead geometry from hooks/utilities.
- May use private render helpers inside the same file for repeated marker/tick markup, but should not create separate component files for axis, pan surface, playhead, or export markers.

`components/TimelineLane.jsx`

- Renders one lane from a lane view model.
- Receives prepared geometry, text visibility, tooltip model, hover handlers, and highlight geometry.
- Keeps no local tooltip state.

### Hooks

Hooks should be durable domains, not one hook per event callback. Aim for roughly 150-200 LOC each after comments; do not split a cohesive hook just to hit a line target.

`hooks/useOverlayPlayer.js`

- Top-level player orchestrator.
- Selects the player store slice once with `useShallow`.
- Calls `usePlaybackEngine`, `useTimelineViewport`, `useExportRangeTimeline`, `useTimelineGestures`, and `useTimelineClips`.
- Owns global keyboard command registration after `usePlayerKeyboard.js` is merged.
- Builds the final view model consumed by presentational components.
- Keeps feature-level visibility logic in one place, preserving the current `hasActivity || hasVideo` behavior unless product requirements change.

`hooks/usePlaybackEngine.js`

- Keep as the durable playback-clock and playback-command hook.
- Rewrite for a direct second-based API:
  - `play()`
  - `pause()`
  - `resetToStart()`
  - `stepBySeconds(deltaSeconds)`
  - `scrubTo(second)`
  - `commitScrub(second)`
  - `jumpToEnd()`
- Remove slider-shaped APIs like `handleTimelineChange([second])` and `handleTimelineCommit([second])`.
- Continue to own:
  - total playable duration calculation;
  - video-vs-timeline playback source resolution;
  - timeline RAF playback;
  - preview scrub lifecycle;
  - playhead clamping.
- If it remains above roughly 220 LOC after cleanup, move only pure calculations to the relevant utility module; do not split playback ownership across multiple hooks by default.

`hooks/useTimelineViewport.js`

- Rewrite as the durable viewport domain.
- Owns:
  - `viewport` state;
  - measured timeline width via `ResizeObserver`;
  - `containerRef`;
  - major/minor ticks;
  - zoom in/out around the current playhead;
  - Ctrl+wheel zoom around the pointer;
  - fit targets for All, Video, and Activity;
  - reset-to-full behavior;
  - playback follow while not dragging;
  - displayed fit target derivation.
- Remove duplicate `activeTab` state. The active visual target should be derived from the viewport matching a target range; if the media shape changes, reset/refit by media identity and total duration rather than carrying stale tab state.

`hooks/useTimelineGestures.js`

- New durable pointer-interaction hook.
- Replaces `useTimelineDrag.js` and the pointer logic currently spread across axis, pan surface, playhead, and export markers.
- Owns:
  - pointer capture/release;
  - timeline second conversion from `clientX`;
  - scrub start/move/commit/cancel;
  - pan start/move/end;
  - export-marker preview/commit/cancel wiring;
  - a single `isTimelineDragging` flag used by viewport follow.
- Returns ready-to-spread handler props and refs for `TimelineSurface`.

`hooks/useExportRangeTimeline.js`

- New durable export-range-on-timeline hook.
- Owns:
  - `exportRange` and `setExportRange` store selection;
  - conversion between export time strings and seconds;
  - marker preview state;
  - marker clamping/snapping;
  - committed store writes;
  - clip highlight range used by lanes.
- Exposes second-shaped callbacks:
  - `previewMarker(marker, second)`
  - `commitMarker(marker, second)`
  - `cancelMarkerPreview()`
- Does not render marker DOM and does not own pointer capture.

`hooks/useTimelineClips.js`

- New durable clip-lane hook.
- Owns:
  - video and activity lane view models;
  - labels, format labels, durations, start offsets, and visibility flags;
  - clip geometry and text visibility;
  - lane tooltip state and tooltip geometry;
  - export highlight geometry per lane.
- Uses canonical lane fields such as `startSecond`, `durationSeconds`, and `isVideo`, instead of remapping values in component props.

### Utilities

Utility files follow the same durable-domain rule as hooks and components: avoid both a 400 LOC grab bag and a tiny file per helper. Target 3 utility files for this feature. If any utility file remains above roughly 250 LOC after cleanup, the implementation should explicitly justify why it is one cohesive calculation domain.

`utils/playerTiming.js`

- Own pure playback/time helpers:
  - timeline time formatting;
  - total playable duration calculation;
  - video-vs-timeline playback source resolution;
  - playback anchor creation;
  - elapsed timeline second calculation.
- Keep this module independent from viewport and DOM geometry concepts.

`utils/timelineViewport.js`

- Own pure viewport/range helpers:
  - viewport clamping;
  - full-range fitting;
  - target-range fitting;
  - zoom;
  - pan;
  - playhead follow;
  - fit-target range construction and matching;
  - tick calculation.
- Keep this module independent from React, store state, and pointer-event handling.

`utils/timelineGeometry.js`

- Own pure timeline geometry helpers:
  - pointer-to-second conversion;
  - second-to-pixel conversion;
  - device-pixel rounding;
  - clip geometry;
  - export marker clamping/snapping;
  - export highlight geometry.
- Keep this module independent from playback source and viewport state ownership.

The existing `playerTimeline.js` should be split across these modules and removed, rather than preserved as a compatibility barrel. Update imports and tests to the new domain modules so obsolete helper groupings do not survive.

## Data Shape Rules

Use domain-shaped data end to end. Do not create avoidable adapter shapes such as `second: nextSecond` or legacy slider arrays.

Preferred callback/data names:

- `playheadSecond`
- `startSecond`
- `durationSeconds`
- `fromSecond`
- `toSecond`
- `viewStart`
- `viewEnd`
- `marker`
- `second`

Examples:

```js
playback.scrubTo(second)
playback.commitScrub(second)
exportTimeline.previewMarker(marker, second)
exportTimeline.commitMarker(marker, second)
```

Avoid:

```js
handleTimelineChange([second])
handleTimelineCommit([second])
onPreview({ second: nextSecond })
```

## Per-File Disposition

| Existing file | Disposition | Plan |
| --- | --- | --- |
| `app/src/features/player/index.js` | Kept | Continue exporting `OverlayPlayer`. Update only if component path changes, which this plan avoids. |
| `app/src/features/player/components/OverlayPlayer.jsx` | Rewritten | Keep the public component name, remove store selectors/effects/state/derived data. It calls `useOverlayPlayer` and renders presentational `PlayerToolbar` and `TimelineSurface`. |
| `app/src/features/player/components/TimelineAxis.jsx` | Merged, then deleted | Move axis markup into `TimelineSurface.jsx`. Move pointer-to-second and drag behavior into `useTimelineGestures`. Keep tick calculation in `useTimelineViewport`/`timelineViewport.js`. |
| `app/src/features/player/components/TimelineExportMarkers.jsx` | Merged, then deleted | Move export range state and marker preview/commit logic into `useExportRangeTimeline`. Move pointer handling into `useTimelineGestures`. Move marker DOM into `TimelineSurface.jsx`. |
| `app/src/features/player/components/TimelineLane.jsx` | Rewritten | Keep as a presentational lane renderer. Move tooltip state, text visibility, geometry, formatting, and highlight derivation to `useTimelineClips` and pure utilities. |
| `app/src/features/player/components/TimelinePanSurface.jsx` | Merged, then deleted | Move pan markup into `TimelineSurface.jsx`. Move pan state and delta conversion into `useTimelineGestures`. |
| `app/src/features/player/components/TimelinePlayhead.jsx` | Merged, then deleted | Move playhead DOM into `TimelineSurface.jsx`. Move pointer handling and pixel geometry into `useTimelineGestures`/`timelineGeometry.js`. |
| `app/src/features/player/hooks/usePlaybackEngine.js` | Kept and rewritten | Preserve playback ownership, RAF logic, source switching, and scrub lifecycle. Replace slider-shaped handlers with second-based commands. Move pure calculations out if needed to keep the hook cohesive. |
| `app/src/features/player/hooks/usePlayerKeyboard.js` | Merged, then deleted | Fold keyboard registration into `useOverlayPlayer`, where the final command model exists. Do not keep a separate tiny keyboard hook unless keyboard scope grows substantially. |
| `app/src/features/player/hooks/useTimelineDrag.js` | Merged, then deleted | Replace the generic mini-hook with `useTimelineGestures`, which owns all timeline pointer interactions as one durable domain. |
| `app/src/features/player/hooks/useTimelineViewport.js` | Kept and rewritten | Expand from raw viewport state to the full viewport domain: measurement, ticks, wheel zoom, fit targets, reset, follow, and displayed fit target derivation. |
| `app/src/features/player/utils/playerTimeline.js` | Split, then deleted | Split into `playerTiming.js`, `timelineViewport.js`, and `timelineGeometry.js`. Remove obsolete code/comments, dedupe pixel rounding, and update imports/tests so the old grab-bag module does not remain as a barrel. |

## Implementation Sequence

1. Add tests around the new contracts before broad moves.
   - Update playback tests to expect second-based commands.
   - Add focused tests for export marker preview/commit through `useExportRangeTimeline`.
   - Add focused tests for gesture-driven scrub/pan/export marker callbacks through `useTimelineGestures`.
   - Keep pure helper tests mapped to the new utility modules.

2. Refactor `usePlaybackEngine`.
   - Rename public commands to second-based names.
   - Remove array-shaped scrub handler inputs.
   - Keep source-switching behavior unchanged for `video-preview`.
   - Verify `usePlaybackEngine.test.jsx` still covers video-owned playback, timeline handoff, RAF advancement, and pause-at-end.

3. Build `useOverlayPlayer`.
   - Move the store selector from `OverlayPlayer.jsx`.
   - Compose playback, viewport, export range, gestures, and clips.
   - Move keyboard registration here.
   - Return a stable view model for components.

4. Rewrite `useTimelineViewport`.
   - Move `ResizeObserver`, `containerRef`, wheel zoom, tick derivation, fit target derivation, and reset logic out of `OverlayPlayer.jsx`.
   - Remove `activeTab` state in favor of matching the viewport against canonical fit target ranges.
   - Use pure helpers to avoid hand-coded range remapping in the hook.

5. Add `useExportRangeTimeline`, `useTimelineGestures`, and `useTimelineClips`.
   - Export range hook owns store writes and preview state.
   - Gesture hook owns pointer capture and all drag/pan/scrub event props.
   - Clips hook owns lane view models, tooltip state, and geometry.

6. Rewrite the components.
   - Replace `OverlayPlayer.jsx` internals with the hook adapter and simple layout.
   - Add `PlayerToolbar.jsx`.
   - Add `TimelineSurface.jsx`.
   - Rewrite `TimelineLane.jsx` as a pure view.
   - Delete the merged component files after imports/tests are moved.

7. Clean utilities and imports.
   - Remove stale helper comments and duplicate rounding helpers.
   - Split `playerTimeline.js` into the three durable-domain utility modules and delete the old file.

8. Update tests.
   - Replace tests that mock internal hooks from `OverlayPlayer.test.jsx` with tests against `useOverlayPlayer` where the behavior is orchestration, and tests against presentational components where the behavior is rendering.
   - Keep a small `OverlayPlayer` smoke test to assert hidden/visible shell and public integration.
   - Update direct imports for deleted components.

## Testing Plan

Run these after implementation:

```bash
npm test -- app/src/tests/features/player
npm run lint
```

Test coverage should include:

- `usePlaybackEngine`: playback source resolution, handoff between video/timeline, second-based scrub/commit, RAF frame advancement, pause at duration end.
- `useTimelineViewport`: full fit, media changes, zoom, Ctrl+wheel pivot, fit target matching, reset, follow while playing, suspended follow while dragging.
- `useTimelineGestures`: axis scrub, playhead scrub, pan delta conversion, export marker preview/commit/cancel, pointer capture cleanup.
- `useExportRangeTimeline`: custom-only markers, clamping, snapping, no redundant store writes, preview highlight.
- `useTimelineClips`: video/activity lane models, labels, geometry, tooltip model, export highlight.
- Utility modules: pure playback timing, viewport/range/tick helpers, and timeline geometry/export-marker helpers.
- Presentational components: render expected controls/labels from supplied view models; no store mocking needed.

## Over-Splitting Audit

Rejected splits:

- No separate `TimelineAxis.jsx`, `TimelinePlayhead.jsx`, `TimelinePanSurface.jsx`, or `TimelineExportMarkers.jsx` files. These are DOM regions of one timeline surface, not durable independent component domains.
- No `useZoomButtons`, `useTimelineTabs`, `usePlayheadDrag`, `usePanDrag`, `useExportMarkerDrag`, or similar callback-sized hooks.
- No separate utility files for every helper function. Use the three durable utility domains above; if a fourth utility file is proposed, explain why it is a stable domain rather than overflow from the old grab bag.
- No standalone `usePlayerKeyboard.js` after the refactor. Keyboard is command routing and belongs with the top-level player command model unless it grows.

Expected final count:

- Component files: 4
- Hook files: 6
- Utility files: 3
- Entrypoint files: 1
- Total `app/src/features/player` files: 14

This satisfies the requested 3-4 presentational component files and 5-7 hook files while keeping hooks and utilities aligned to durable domains instead of individual callbacks, DOM fragments, or helper grab bags.

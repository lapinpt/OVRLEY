# NLE Timeline Rework — Specification

## Goal

Rework `app/src/features/player/` to present the playback timeline as an NLE-editor-style timeline (zoomable x-axis, dual clip lanes, draggable playhead, draggable export-range markers).

## Hard constraint — presentation only

This is a **data-presentation** change. The play workflow must not change:

- Frame fetching, playhead-position determination, playback clock, and store playback actions are **out of scope**.
- `hooks/usePlaybackEngine.js` and `hooks/usePlayerKeyboard.js` remain **byte-for-byte unchanged**.
- All seek / scrub / transport actions are routed through the existing handlers exposed by `usePlaybackEngine`: `handleTimelineChange`, `handleTimelineCommit`, `handlePlay`, `handlePause`, `handleReset`, `handleStepByDirection`.
- No new store actions. No new playback-engine code.

## Layout

A single timeline body with three vertical regions:

1. **Toolbar** (top row) — three sections:
   - **Left:** zoom-out, zoom-in, reset-view, and tab selector (All / Video / Activity).
   - **Center:** transport controls (see §Transport).
   - **Right:** current playhead time / total time (`formatTimelineTime(displayedPlayhead) / formatTimelineTime(totalDuration)`).
2. **Axis row** — major/minor ticks + major labels, auto-calculated from the visible range. Also the click-to-seek / drag-to-scrub surface.
3. **Lanes** — Video lane (top) and Activity lane (bottom), each holding at most one clip rectangle.

A positioned overlay above the axis+lanes renders the playhead and export-range markers as continuous vertical lines spanning all rows. The overlay is `pointer-events-none` except on the drag handles.

All CSS dimensions use **rem** (lane height ~2.125rem, text-hide threshold ~3rem, etc.). The axis pixel width is measured at runtime via `ResizeObserver` (inherently px) and used for tick math and px↔second conversion.

## Viewport (zoom) state

- New hook `hooks/useTimelineViewport.js` holds local React state `{ viewStart, viewEnd }` in seconds, clamped to `[0, totalDuration]`.
- **Not** in the Zustand store — ephemeral, presentation-only.
- Pure helpers live in `utils/playerTimeline.js`.
- Initial viewport on mount = fit-all. Re-fit when `totalDuration` transitions (e.g. activity loads).

### Auto-zoom tabs

- **All** → `[0, totalDuration]`.
- **Video** → `[videoSyncOffsetSeconds, videoSyncOffsetSeconds + importedVideoDuration]`.
- **Activity** → `[0, activitySummary.durationSeconds]` (or `fallbackDurationSeconds`).
- Fit operations add **4% padding** each side, clamped to `[0, totalDuration]`, with a **2s minimum visible span**.
- `resetView` = fit-all (viewport only; playhead untouched).
- **Video tab hidden** (not disabled) when no `importedVideoPath`. **Activity tab hidden** when no activity.

### Zoom interaction

- Zoom in/out buttons: pivot at the **playhead** (clamped into the current view so a far playhead doesn't yank the viewport), **1.6× per click**, min span **0.5s**, max span = `totalDuration`.
- **Ctrl+wheel** zoom: pivot at the **cursor position**. Plain wheel = no-op.

### Pan & playhead follow

- **Auto-follow while playing:** when `isPlaying` and `clampedPlayhead >= viewEnd` (or `< viewStart`), jump so the playhead sits at **15% from the left** of the new window (`viewStart = playhead - 0.15 * span`, clamped to `[0, total - span]`). Suspended while a scrub/pan drag is active.
- **Manual pan:** pointer drag on the **lane background** (not the axis, not a clip, not a handle) shifts `[viewStart, viewEnd]` by the dragged delta (px→s via current px-per-second). Disabled when `viewSpan >= totalDuration` (nothing to pan). No scrollbar UI.

## Ticks & labels

Pure function `computeTimelineTicks({ viewStart, viewEnd, widthPx })` in `utils/playerTimeline.js`:

- Target major spacing **~90px** (rem-aware constant), yielding ~6–14 major ticks.
- Nice major steps (seconds): `[0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]`. Pick the smallest step whose pixel spacing ≥ target.
- **Minor ticks** = major / 5.
- **Labels** (major only): reuse `formatTimelineTime` (mm:ss or h:mm:ss) for major step ≥ 1s; for major step < 1s, label as `SS.t` one-decimal (e.g. `0.5s`).
- Tick grid anchored to `ceil(viewStart / step) * step` so labels don't drift on pan.
- First/last major may clip at viewport edges — clamp x to `[0, width]`.

## Lanes & clips

- **Video lane** (top): clip at `videoSyncOffsetSeconds`, duration `importedVideoDuration`, label `basename(importedVideoPath)`. Lane **omitted entirely** when no `importedVideoPath`.
- **Activity lane** (bottom): clip at `0`, duration `activitySummary.durationSeconds`, label `activityFilename || activitySummary?.fileName || 'Activity'`.
- Clip geometry: `x = ((clipStart - viewStart) / viewSpan) * widthPx`, `width = (clipDuration / viewSpan) * widthPx`. Clips fully outside the viewport are culled.
- Label overflow: `truncate` (ellipsis); **hide text when rect width < ~3rem** (bar only); full filename + duration shown via hover tooltip (`SimpleTooltip` + `formatTimelineTime`).
- **Clips are non-interactive** (no click/double-click seek). Scrubbing is via the axis or playhead triangle only.

### Clip colors

- Video clip → `bg-accent/70` (aqua `#40e0d0`), label `text-accent-foreground`, border `border-accent/40`.
- Activity clip → `bg-foreground/30` (ice `#86aaaa`), label `text-background`, border matching.
- Neither collides with the orange playhead or green export markers.

### Out-of-range dimming (when custom export range active)

- Render the full clip rect, then overlay `bg-surface-darken/50` (existing `--surface-darken` token) on the portions **outside** `[exportFrom, exportTo]` as `pointer-events-none` siblings inside each clip's box.
- **No full-width mask** — dimming is per-clip so axis seek + lane pan stay fully interactive.

## Scrub mechanics (axis + triangle)

Shared helper `pointerToSecond(clientX, axisRect, view, widthPx)` = `viewStart + (clientX - axisRect.left) / widthPx * viewSpan`, clamped to `[0, totalDuration]`.

- **Axis pointerdown** = seek: compute second → `handleTimelineChange([second])`; on pointerup `handleTimelineCommit([second])`. A click with no move still does change→commit (a seek).
- **Axis pointermove (while down)** = scrub: `handleTimelineChange([second])` each move.
- **Triangle pointerdown** = start scrub; **pointermove** = `handleTimelineChange([second])`; **pointerup** = `handleTimelineCommit([second])`.
- Pointer events + `setPointerCapture` so the drag survives leaving the element.
- `displayedPlayhead` (already tracks `dragSecond` during scrub) feeds the triangle's x, so it follows the pointer live.
- `usePlaybackEngine` and `usePlayerKeyboard` untouched.

## Transport bar (center, small buttons)

Five buttons, in order:

1. **Rewind to start** → `handleReset` (pauses at 0).
2. **Step back** → `handleStepByDirection(-1)`.
3. **Play/Pause toggle** → `isPlaying ? handlePause() : handlePlay()`.
4. **Step forward** → `handleStepByDirection(1)`.
5. **Rewind to end** → `handleTimelineChange([totalDuration])` then `handleTimelineCommit([totalDuration])` (pauses at end, since `commitPreviewScrub` sets state `'paused'`).

Old `<Slider>` (and its `trackChildren` video bar) is **removed**; the axis + triangle replace it.

## Export-range markers

- Visible **only when `exportRange.type === 'custom'`**.
- Two vertical lines at `clamp(timeToSeconds(exportRange.fromTime), 0, totalDuration)` and same for `toTime`. Reuse existing `timeToSeconds` from `features/overlay-editor/utils/exportRange.js`.
- **Drag mutation:** `pointerToSecond` → clamp → `formatExportRangeTime(seconds)` (existing helper) → existing `setExportRange({ fromTime })` / `setExportRange({ toTime })` (merges partial). Live WYSIWYG on each `pointermove`; pointerup is a no-op (already committed).
- **Mutual constraint:** dragging *from* clamps to `[0, to - 1s]`; dragging *to* clamps to `[from + 1s, totalDuration]`.
- **Visual:** green (`--theme-color-success`, new token) vertical lines spanning axis+lanes, **bracket-shaped handles** `[` `]` at the top, hover tooltips "Export in" / "Export out". No background tint between the lines — instead, clip portions outside the range are dimmed per §Out-of-range dimming.

## Colors & theme tokens

- Playhead → `bg-primary` (orange `#c65102`, i.e. `--theme-color-accent`).
- Export markers → new `--theme-color-success` green token (add to `index.css` `:root` and map in `styles/theme.css`).
- Video clip → `bg-accent/70` (aqua).
- Activity clip → `bg-foreground/30` (ice).
- Out-of-range dim → `bg-surface-darken/50`.
- Root CSS sets `text-transform: uppercase` globally; timeline labels follow this (consistent with app design language).

## Component decomposition

```
app/src/features/player/
  index.js                      (unchanged — exports OverlayPlayer)
  components/
    OverlayPlayer.jsx           (container: wires usePlaybackEngine + usePlayerKeyboard +
                                useTimelineViewport + store selectors; owns axis-width ref
                                via ResizeObserver; renders toolbar + timeline body)
    TimelineToolbar.jsx         (3 sections: zoom tabs / transport / time display)
    TimelineAxis.jsx            (ticks+labels; pointer seek/scrub surface)
    TimelineLane.jsx            (one clip lane, reused for video + activity; out-of-range dim)
    TimelinePlayhead.jsx        (vertical line + triangle handle; drag→scrub)
    TimelineExportMarkers.jsx   (in/out lines + bracket handles; drag→setExportRange)
  hooks/
    usePlaybackEngine.js        (UNCHANGED)
    usePlayerKeyboard.js        (UNCHANGED)
    useTimelineViewport.js      (NEW: viewStart/viewEnd + zoomBy/fitAll/fitVideo/
                                fitActivity/resetView/panBy/followPlayhead)
    useTimelineDrag.js          (NEW: shared pointer-drag helper, setPointerCapture,
                                used by axis-scrub / triangle-scrub / pan / marker-drag)
  utils/
    playerTimeline.js           (ADD pure helpers: zoomRange, fitRangeToViewport,
                                followPlayhead, panBy, pointerToSecond, computeTimelineTicks,
                                secondsToViewPx, clampToView; keep existing helpers)
```

### Overlay layout

```
<div class="relative" ref={widthRef}>        // measured via ResizeObserver
  <TimelineAxis .../>                         // seek/scrub surface
  <TimelineLane video/>                       // omitted when no importedVideoPath
  <TimelineLane activity/>
  <div class="absolute inset-0 pointer-events-none">  // overlay
    <TimelinePlayhead/>                       // handle re-enables pointer events
    <TimelineExportMarkers/>                  // handles re-enable pointer events
  </div>
</div>
```

### Store-selector additions in `OverlayPlayer`

- `exportRange`, `setExportRange`, `activityFilename` (new for presentation).
- The rest of today's selectors stay. `backgroundMode` stays a prop.

## Data sources (confirmed)

- `totalDuration` ← `getTotalPlaybackDuration({ activityDurationSeconds: activitySummary?.durationSeconds, fallbackDurationSeconds, importedVideoDuration, importedVideoPath, videoSyncOffsetSeconds })` (existing in `utils/playerTimeline.js`).
- Video clip: `importedVideoPath` (basename for label), `importedVideoDuration`, start `videoSyncOffsetSeconds`.
- Activity clip: `activityFilename` (or `activitySummary?.fileName`), `activitySummary.durationSeconds`, start `0`.
- Export range: `state.exportRange` = `{ type: 'all'|'custom', fromTime, toTime }` (HH:MM:SS strings); `setExportRange(partial)` merges.
- `OverlayPlayer` rendered at `App.jsx:243`.

## Out of scope

- Wheel zoom without Ctrl.
- Scrollbar / minimap UI.
- Clip click-to-seek / marquee selection.
- Frame-based labels at high zoom.
- Persisting zoom/pan across reloads.
- Any change to `usePlaybackEngine`, `usePlayerKeyboard`, or store playback actions.

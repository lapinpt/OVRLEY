# S2 - Zoom controls + 5-button NLE transport

## Parent

PRD: `.agents/scratch/NLE-timeline/PRD.md` - Spec: `.agents/scratch/NLE-timeline/spec.md`

## What to build

Complete the toolbar.

The **left section** gets zoom-out, zoom-in, reset-view, and the auto-zoom tab selector: **All / Video / Activity**.

- **All** fits to the full playable range `[0, totalDuration]`.
- **Video** fits to the imported video window `[videoSyncOffsetSeconds, videoSyncOffsetSeconds + importedVideoDuration]`.
- **Activity** fits to `[0, activitySummary.durationSeconds]`, falling back to `[0, fallbackDurationSeconds]` when needed.

The Video tab is hidden when there is no `importedVideoPath`. The Activity tab is hidden when there is no activity. Auto-zoom fits add 4% padding on each side, clamp to `[0, totalDuration]`, and maintain a 2s minimum visible span where the total duration allows it. Reset-view is equivalent to fit-all and does not move the playhead.

Zoom in/out buttons pivot at the current playhead (clamped into the visible window), step 1.6x per click, with a 0.5s minimum visible span and the total duration as the maximum. Holding Ctrl while scrolling the wheel zooms at the pointer position; plain wheel is a no-op.

The **center section** is replaced with the 5-button NLE transport: rewind-to-start, step-back, a single play/pause toggle, step-forward, rewind-to-end. Rewind-to-end jumps to the total duration and pauses by composing the existing scrub handlers with the total-duration value. The buttons are compact and small.

The axis ticks and the playhead x position recompute live as the visible window changes.

This adds the zoom/fit pure helpers and the viewport hook's `zoomBy`, `fitAll`, `fitVideo`, `fitActivity`, and `resetView` actions. The transport buttons map entirely to existing playback-engine handlers; no new playback-engine handlers or store actions are introduced.

## Acceptance criteria

- [x] Zoom-in/out buttons zoom 1.6x around the playhead, clamped into the visible window, with a `[0.5s, totalDuration]` visible span.
- [x] Ctrl+wheel zooms at the pointer position; plain wheel does nothing.
- [x] The left toolbar contains zoom-out, zoom-in, reset-view, and an All / Video / Activity auto-zoom tab selector.
- [x] All fits to `[0, totalDuration]`.
- [x] Video fits to `[videoSyncOffsetSeconds, videoSyncOffsetSeconds + importedVideoDuration]` and is hidden when no imported video exists.
- [x] Activity fits to `[0, activitySummary.durationSeconds]`, falling back to `[0, fallbackDurationSeconds]`, and is hidden when no activity exists.
- [x] Auto-zoom tab fits add 4% side padding, clamp to `[0, totalDuration]`, and maintain a 2s minimum visible span where possible.
- [x] Reset-view fits to the full range; zoom and fit actions do not move the playhead.
- [x] Ticks and playhead x recompute live as the visible window changes.
- [x] The center transport is the 5-button set (rewind-to-start, step-back, play/pause toggle, step-forward, rewind-to-end), compact and small.
- [x] Rewind-to-end pauses the playhead at the total duration.
- [x] The play/pause button reflects the current playing state.
- [x] Zoom/fit pure helpers and the viewport hook's zoom/fit actions have tests, including All, Video, and Activity fit targets.
- [x] `usePlaybackEngine.js`, `usePlayerKeyboard.js`, and store playback actions remain unchanged.

## Blocked by

- S1 - timeline skeleton

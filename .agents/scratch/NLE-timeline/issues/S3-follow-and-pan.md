# S3 — Auto-follow during playback + background-drag pan

## Parent

PRD: `.agents/scratch/NLE-timeline/prd.md` · Spec: `.agents/scratch/NLE-timeline/spec.md`

## What to build

When zoomed in and playing, the timeline keeps the playhead visible: once the playhead reaches the right edge of the visible window, the viewport jumps so the playhead sits at ~15% from the left of the new window. This auto-follow is suspended while a scrub or pan drag is active, so playback does not yank the viewport out from under the user's pointer. Auto-follow does not trigger while paused.

When not playing, the user can pan by dragging the lane background (the area below the axis, not the axis itself and not a clip). The drag shifts the visible window by the dragged pixel delta converted to seconds via the current px-per-second. Panning is a no-op when the whole timeline already fits.

This adds the follow and pan pure helpers, the viewport hook's pan action and a playback-follow effect (driven by the existing `isPlaying` + playhead values, suspended during an active drag), and wires the lane-background drag through the existing pointer-drag primitive. No playback-engine changes.

## Acceptance criteria

- [ ] While playing and zoomed in, when the playhead exits the right edge, the viewport advances so it sits at ~15% from the left of the new window.
- [ ] Auto-follow is suspended during an active scrub or pan drag.
- [ ] Auto-follow does not trigger while paused.
- [ ] Dragging the lane background pans the visible window; the axis and playhead stay aligned.
- [ ] Panning is a no-op when the visible window equals the full range.
- [ ] Follow and pan pure helpers and the viewport hook's follow effect have tests.

## Blocked by

- S2 — zoom controls (needs the zoom infrastructure to produce a non-full visible window)

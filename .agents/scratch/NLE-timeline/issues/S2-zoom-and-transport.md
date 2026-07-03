# S2 — Zoom controls + 5-button NLE transport

## Parent

PRD: `.agents/scratch/NLE-timeline/prd.md` · Spec: `.agents/scratch/NLE-timeline/spec.md`

## What to build

Complete the toolbar.

The **left section** gets zoom-out, zoom-in, reset-view, and an "All" tab. Zoom in/out buttons pivot at the current playhead (clamped into the visible window), step 1.6× per click, with a 0.5s minimum visible span and the total duration as the maximum. Reset-view and the All tab both fit to the full range. Holding Ctrl while scrolling the wheel zooms at the pointer position; plain wheel is a no-op.

The **center section** is replaced with the 5-button NLE transport: rewind-to-start, step-back, a single play/pause toggle, step-forward, rewind-to-end. Rewind-to-end jumps to the total duration and pauses (composing the existing scrub handlers with the total-duration value). The buttons are compact and small.

The axis ticks and the playhead x position recompute live as the visible window changes.

This adds the zoom/fit pure helpers and the viewport hook's `zoomBy`, `fitAll`, and `resetView` actions. The transport buttons map entirely to existing playback-engine handlers; no new handlers are introduced.

## Acceptance criteria

- [ ] Zoom-in/out buttons zoom 1.6× around the playhead (clamped into the visible window), clamped to a [0.5s, total duration] visible span.
- [ ] Ctrl+wheel zooms at the pointer position; plain wheel does nothing.
- [ ] Reset-view and the All tab fit to the full range; zoom does not move the playhead.
- [ ] Ticks and playhead x recompute live as the visible window changes.
- [ ] The center transport is the 5-button set (rewind-to-start, step-back, play/pause toggle, step-forward, rewind-to-end), compact and small.
- [ ] Rewind-to-end pauses the playhead at the total duration.
- [ ] The play/pause button reflects the current playing state.
- [ ] Zoom/fit pure helpers and the viewport hook's zoom actions have tests.

## Blocked by

- S1 — timeline skeleton

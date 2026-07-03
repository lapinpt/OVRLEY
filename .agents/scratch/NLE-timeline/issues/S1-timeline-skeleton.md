# S1 — Timeline skeleton: replace slider with full-range axis + playhead that scrubs

## Parent

PRD: `.agents/scratch/NLE-timeline/prd.md` · Spec: `.agents/scratch/NLE-timeline/spec.md`

## What to build

Replace the existing playback scrub slider with a ticked NLE-style timeline that shows the full playable range at a fixed (non-zoomed) view.

The timeline has a 3-section toolbar skeleton: left section empty/placeholder for now, center section reuses the existing play/pause/reset transport as-is, right section shows the current playhead time / total time. Below the toolbar, an axis row renders auto-calculated major/minor ticks with timecode labels (recomputing on axis-width or total-duration change, since there is no zoom yet). A vertical playhead line with a triangle handle at the top spans the axis (clip lanes come later). The playhead position is driven by the existing displayed-playhead value, so it sweeps left-to-right during playback.

Clicking the axis seeks the playhead to that second; dragging the axis or the triangle scrubs continuously and commits on release — all routed through the existing scrub handlers (`handleTimelineChange` / `handleTimelineCommit`), with the old slider removed entirely. The whole timeline is sized in rem. On first render and whenever the total playable duration changes (e.g. a new activity loads), the view re-fits to the full range.

This slice establishes the foundational architecture: a local viewport hook holding the visible window `{ viewStart, viewEnd }` as local React state (full-range only; no zoom actions yet), the pure timeline geometry + tick helpers, a shared pointer-drag primitive, and the container component that wires the unchanged playback-engine and keyboard hooks plus the new viewport hook and owns the axis-width measurement via a ResizeObserver. The playback engine hook and keyboard hook must remain unchanged.

## Acceptance criteria

- [x] The old scrub slider is gone; a ticked timeline renders in its place, sized in rem.
- [x] Major/minor ticks auto-calculate from the measured axis width and full playable range, with timecode labels on majors only, using the 1/2/5 cadence; grid anchored to the step boundary.
- [x] A vertical playhead line with a triangle handle spans the axis and moves with playback (sweeps left-to-right).
- [x] Clicking the axis seeks the playhead to that position; dragging the axis or the triangle scrubs and commits on release — equivalent to the old slider.
- [x] The current-time / total-time readout on the right stays correct during playback and scrubbing.
- [x] Keyboard shortcuts (space, arrows) still behave exactly as before.
- [x] The view re-fits to the full range when the total playable duration changes.
- [x] The playback engine hook and keyboard hook are unchanged (diff is empty).
- [x] Pure helpers (tick computation, seconds-to-view-px, clamp-to-view, fit-to-full, pointer-to-second) and the viewport hook have tests.

## Blocked by

None — can start immediately.

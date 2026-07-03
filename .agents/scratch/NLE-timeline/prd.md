# PRD — NLE Timeline

## Problem Statement

As a cyclemetry overlay author, when I preview my overlay against an activity (and an optional imported video), the only temporal control I have is a single thin scrub slider. I cannot zoom into a specific moment, I cannot see where my video clip sits relative to the activity timeline, I cannot visually relate the playhead to the export range, and I cannot adjust the export range by dragging it on the timeline. This makes precise scrubbing, sync inspection, and export-window selection clumsy — I have to mentally map a flat slider onto clip and export boundaries that are only described elsewhere in the sidebar.

## Solution

Replace the slider-based playback bar with an NLE-editor-style timeline: a zoomable x-axis with auto-calculated ticks and labels, two clip lanes (video on top, activity on bottom) rendered as proportional rectangles positioned by their real offsets, a draggable playhead that sweeps across the whole timeline, and draggable in/out markers for the custom export range. The toolbar above the timeline groups zoom controls (left), transport controls (center), and the time readout (right).

This is a **presentation-only** change: the playback clock, frame fetching, and playhead-position logic are untouched. All seek, scrub, and transport actions route through the existing playback-engine handlers. The new timeline only changes how temporal data is displayed and how the user points at time.

## User Stories

1. As an overlay author, I want the playback bar replaced by a timeline with a ticked x-axis, so that I can read time positions precisely instead of guessing from a flat slider.
2. As an overlay author, I want major and minor ticks auto-calculated from the visible range, so that the axis stays readable whether I am zoomed out to the whole ride or zoomed into a few seconds.
3. As an overlay author, I want major ticks labelled with timecode and minor ticks unlabelled, so that I can scan time without visual clutter.
4. As an overlay author, I want timecode labels that adapt to the zoom level (mm:ss, h:mm:ss, and sub-second decimals at deep zoom), so that the precision shown matches what I can actually select.
5. As an overlay author, I want a zoom-in and a zoom-out button, so that I can change the visible time range without a pointer device.
6. As an overlay author, I want zoom to pivot around the current playhead, so that the frame I am looking at stays on screen while the range shrinks or grows.
7. As an overlay author, I want a reset-view control, so that I can return to the full-timeline view in one action.
8. As an overlay author, I want an "All" tab that zooms the timeline to the full playable range, so that I can see everything at once.
9. As an overlay author, I want a "Video" tab that zooms to the imported video's window, so that I can inspect the video clip closely.
10. As an overlay author, I want an "Activity" tab that zooms to the activity duration, so that I can focus on the telemetry range.
11. As an overlay author, I want the Video tab hidden when no video is imported and the Activity tab hidden when there is no activity, so that the toolbar only offers actions that make sense for my current session.
12. As an overlay author, I want to zoom by holding Ctrl and scrolling the wheel, so that I can zoom fluidly toward the pointer position.
13. As an overlay author, I want the playhead to remain visible during playback when zoomed in, so that it does not run off the edge of the timeline.
14. As an overlay author, I want the timeline to auto-advance during playback so that the playhead sits near the left of the visible window when it reaches the right edge, so that I always have lookahead while playing.
15. As an overlay author, I want to pan the timeline by dragging the lane background, so that I can scroll around a zoomed-in timeline without a scrollbar.
16. As an overlay author, I want panning disabled when the whole timeline already fits, so that background drag does nothing confusing.
17. As an overlay author, I want a video clip lane above an activity clip lane, so that the two media sources are visually separated and comparable.
18. As an overlay author, I want each clip rendered as a colored rectangle whose width equals its duration and whose start matches its real offset (taking the video sync offset into account), so that I can see how the video and activity overlap in time.
19. As an overlay author, I want the clip filename shown inside its rectangle, so that I can identify which file each clip represents.
20. As an overlay author, I want long filenames truncated with a tooltip showing the full name and duration, so that narrow clips stay readable and full info is available on hover.
21. As an overlay author, I want the clip text hidden when the rectangle is too narrow, so that tiny clips do not show garbled partial text.
22. As an overlay author, I want the video lane omitted entirely when no video is imported, so that the timeline does not waste space on an empty track in the common activity-only case.
23. As an overlay author, I want a vertical playhead line with a triangle handle at the top that spans the axis and both lanes, so that the current position is unambiguous across the whole timeline height.
24. As an overlay author, I want the playhead to sweep from left to right as playback progresses, so that I can follow progress at a glance.
25. As an overlay author, I want to scrub the playhead by dragging the triangle handle, exactly as I could with the old slider thumb, so that precise manual positioning still works.
26. As an overlay author, I want to click anywhere on the tick axis to seek the playhead to that position, so that I can jump to a moment in one click.
27. As an overlay author, I want to drag on the tick axis to scrub the playhead continuously, so that I can audition a range by feel.
28. As an overlay author, I want transport controls in the center of the toolbar: rewind to start, step back, a single play/pause toggle, step forward, and rewind to end, so that I have the standard NLE transport set in a compact group.
29. As an overlay author, I want the current playhead time and the total time shown on the right of the toolbar, so that I can read absolute time positions.
30. As an overlay author, I want the export range shown as two vertical in/out lines on the timeline when a custom export range is active, so that I can see the export window relative to the playhead and clips.
31. As an overlay author, I want to drag the export in/out lines left and right to change the export range, so that I can set the export window directly on the timeline instead of typing timecodes.
32. As an overlay author, I want the export in and out lines constrained so that "from" stays before "to" with a minimum gap, so that I cannot create a nonsensical or zero-length range by dragging.
33. As an overlay author, I want the portions of the video and activity clips that fall outside the export range to be visually darkened, so that I can immediately see what will be included in the export.
34. As an overlay author, I want the darkening to not block interaction with the timeline, so that seeking, scrubbing, and panning still work over dimmed regions.
35. As an overlay author, I want the playhead colored in the app's orange accent so that it is instantly distinguishable from the green export markers and the clip colors.
36. As an overlay author, I want the export markers colored green with bracket-shaped handles, so that they are clearly distinct from the triangle playhead.
37. As an overlay author, I want the whole timeline sized in rem units, so that it scales consistently with the app's type and layout system.
38. As an overlay author, I want keyboard shortcuts (space, arrows) to keep working exactly as before, so that my muscle memory is not broken.
39. As an overlay author, I want the timeline to re-fit to the full range when a new activity or video is loaded, so that I am never stuck looking at a stale zoomed view.
40. As an overlay author, I want the auto-follow behavior to pause while I am manually scrubbing or panning, so that playback does not yank the viewport out from under my pointer.

## Implementation Decisions

### Hard constraint

The playback workflow is out of scope: frame fetching, the playhead clock, and the store's preview-playback actions are not modified. The existing playback engine hook and keyboard hook remain unchanged. Every seek, scrub, and transport action is routed through the existing handlers the playback engine already exposes (`handleTimelineChange`, `handleTimelineCommit`, `handlePlay`, `handlePause`, `handleReset`, `handleStepByDirection`). "Rewind to end" composes the existing scrub handlers with the total duration value rather than introducing a new engine action.

### Viewport model

A visible window `{ viewStart, viewEnd }` in seconds, clamped to `[0, totalDuration]`, is introduced as **local React state** in a new viewport hook — not in the global store. It is ephemeral and presentational. The total playable duration continues to come from the existing total-duration helper.

### Zoom

- Buttons zoom 1.6× per click, pivoting at the current playhead (clamped into the current view), with a minimum visible span of 0.5s and a maximum span of the total duration.
- Ctrl+wheel zooms at the pointer position. Plain wheel is a no-op.
- Auto-zoom tabs target: All = full range; Video = video window (sync offset to offset + duration); Activity = activity duration. Each fit adds 4% padding per side clamped to the total range, with a 2s minimum visible span.
- Reset-view = fit-all (viewport only; the playhead is not moved).

### Pan and follow

- While playing, when the playhead exits the visible window, the viewport jumps so the playhead sits at 15% from the left of the new window. This follow is suspended during an active scrub or pan drag.
- Drag on the lane background pans by converting the pixel delta to seconds via the current px-per-second. Panning is disabled when the whole timeline fits.

### Ticks

A pure tick function computes major/minor ticks from the visible range and the measured axis width. It uses a nice 1/2/5 cadence from 0.1s up to 1h, targets ~90px between major ticks, sets minor ticks to major/5, anchors the grid to the step boundary so labels do not drift on pan, and labels majors only with timecode (mm:ss or h:mm:ss), falling back to one-decimal sub-second labels below 1s.

### Lanes and clips

- Video lane (top): clip starts at the video sync offset, width from the imported video duration, labelled with the video file's basename. The lane is omitted entirely when no video is imported.
- Activity lane (bottom): clip starts at 0, width from the activity duration, labelled with the activity filename (falling back to the activity summary filename, then a default).
- Clip geometry maps seconds to pixels via the visible window; off-screen clips are culled.
- Filenames are truncated with ellipsis and hidden below a rem-based width threshold; a hover tooltip shows the full name and formatted duration.
- Clips are non-interactive — no click-to-seek on clip bodies. Seeking happens via the axis or the playhead triangle.

### Scrub mechanics

A single pointer-to-second helper converts a pointer x into a clamped second using the visible window. Both the axis and the playhead triangle use it to drive the existing scrub handlers (begin/continue on pointer move, commit on pointer up) via pointer events with pointer capture, so the drag survives leaving the element. The displayed playhead (which already tracks the in-progress scrub second) feeds the triangle position.

### Transport

Five compact buttons in the center section: rewind to start, step back, a single play/pause toggle, step forward, rewind to end — mapped to existing handlers. The old slider is removed entirely; the axis and triangle replace it.

### Export-range markers

Visible only when the export range type is "custom". Two vertical lines mark the from/to seconds (converted with the existing time-string parser), draggable via the same pointer-to-second helper, clamped with a 1s minimum gap, written back through the existing export-range setter using the existing seconds-to-timecode formatter. Live WYSIWYG on each move; no separate commit. No background tint between the lines — instead, clip portions outside the range are dimmed per-clip so that axis and lane interactions remain live.

### Colors and theme

- Playhead: the app's orange primary accent.
- Export markers: a new green theme token added to the theme files.
- Video clip: the aqua accent token. Activity clip: the ice foreground token at low opacity.
- Out-of-range dimming: the existing surface-darken token at low opacity, applied as pointer-event-none overlays scoped to each clip.
- All dimensions in rem. The axis pixel width is measured at runtime via a ResizeObserver.

### Module breakdown

- **Deep module — timeline helpers (pure functions):** all viewport, zoom, pan, follow, tick, and pixel/second math. Pure, no React, the primary home of testable logic.
- **Viewport hook (medium depth):** holds the visible window as local state and exposes zoom, fit, reset, pan, and follow actions plus a playback-follow effect. Thin orchestration over the pure helpers.
- **Pointer-drag hook (mechanics):** a shared primitive encapsulating pointer events, pointer capture, and pointer-to-value conversion, reused by axis-scrub, triangle-scrub, pan, and marker-drag.
- **Container component:** wires the unchanged playback engine and keyboard hooks, the new viewport hook, and the store selectors; owns the axis-width measurement; renders the toolbar and timeline body.
- **Presentational components:** toolbar (zoom/transport/time), axis (ticks, seek/scrub surface), lane (one clip lane, reused for video and activity, with out-of-range dimming), playhead (line + triangle handle), export markers (in/out lines + bracket handles).
- **Theme:** add the green token and its mapping.

## Testing Decisions

A good test asserts external behavior of a unit against fixed inputs and outputs, never implementation details or internal call sequences. Pure functions are tested by example (input → expected output). Stateful hooks are tested by rendering them, driving actions, and asserting the resulting state — without asserting how the hook delegates internally.

Tests will be written for:

- **Timeline helpers (pure):** extend the existing player-timeline helper test with cases for zoom (pivot behavior, min/max span, factor), fit (padding, min span, clamping, all three tab targets), follow (15% lead, edge clamping, off-screen entry), pan (delta conversion, clamping, no-op when fully zoomed out), pointer-to-second (clamping at both ends), and tick computation (cadence selection at multiple zoom levels, grid anchoring, label format selection at and below 1s, minor subdivision). Prior art: the existing pure-helper tests for the player feature.
- **Viewport hook:** render the hook with a mocked store and assert that actions transition the visible window correctly, that fit targets produce the expected ranges, that the playback-follow effect advances the window only while playing and is suspended during a drag, and that panning is disabled when the whole range fits. Prior art: the existing playback-clock hook tests, which mock the store and assert state transitions via `renderHook`.

Tests will not be written for the pointer-drag hook (pointer-event mechanics are fiddly and low-ROI) or for the presentational components (their behavior is thin composition of the already-tested logic modules).

Runner: `vitest` (run with `npm test`); lint with `npm run lint`. New tests mirror the existing layout under the player feature's test directory.

## Out of Scope

- Wheel zoom without Ctrl.
- A scrollbar or minimap UI for the timeline.
- Click-to-seek or marquee selection on clip bodies.
- Frame-based labels at high zoom (decimal seconds are used instead).
- Persisting zoom or pan state across reloads.
- Any change to the playback engine hook, the keyboard hook, or the store's preview-playback actions.
- Changes to how the export range is rendered or consumed elsewhere (render config, widget scoping) — only the on-timeline marker presentation and drag are in scope.
- The sidebar export-range inputs remain the source of truth; the timeline markers are a second, equivalent editing surface.

## Further Notes

- The full design contract — including the resolved decisions from the grilling session that produced this PRD — lives in the sibling `spec.md` in the same directory.
- The unchanged playback engine exposes everything the new timeline needs; no new store actions are introduced.
- The export-range marker drag writes through the same setter the sidebar uses, so the two surfaces can never disagree about the source of truth.
- The timeline is rendered only when there is activity; the existing "hidden when no activity" gate on the player container is preserved.

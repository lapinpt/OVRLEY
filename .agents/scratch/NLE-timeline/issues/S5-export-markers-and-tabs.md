# S5 — Export-range markers + Video/Activity auto-zoom tabs

## Parent

PRD: `.agents/scratch/NLE-timeline/prd.md` · Spec: `.agents/scratch/NLE-timeline/spec.md`

## What to build

Add two affordances that build on the clip lanes and the zoom infrastructure.

**(1) Export-range markers.** When the export range type is "custom", two vertical in/out lines appear on the timeline marking the export window, spanning the axis and both lanes. Each line has a bracket-shaped handle at the top and can be dragged left/right to change the export range: dragging converts the pointer position to a second (via the existing pointer-to-second helper), clamps it (from stays before to with a 1s minimum gap; both within `[0, total duration]`), formats it back to timecode via the existing seconds-to-timecode formatter, and writes it through the existing export-range setter — live on each move. The portions of the video and activity clips that inbetween the marks should be have a transparent faint highlight over them so axis seek and lane pan stay interactive over dimmed regions. The markers use a new green theme token added to the theme files; the playhead stays orange and the clip colors unchanged.

**(2) Video/Activity auto-zoom tabs.** Two new tabs in the toolbar left section — Video and Activity — zoom the timeline to the video window and the activity duration respectively, using the same 4% padding and 2s minimum span as the All tab. The Video tab is hidden when no video is imported; the Activity tab is hidden when there is no activity.

This adds the export-marker component (reusing the pointer-drag primitive and the existing time-string parser/formatter), the per-clip out-of-range dimming in the lane component, the fit-video/fit-activity targets in the viewport hook, the Video/Activity tab UI in the toolbar, and the green theme token. No new store actions; the export-range setter and the time-conversion helpers are reused as-is.

## Acceptance criteria

- [ ] When the export range type is "custom", two green vertical in/out lines render spanning axis + lanes; they are absent otherwise.
- [ ] Dragging an in/out line updates the export range live via the existing setter and the timecode formatter.
- [ ] from is constrained to `[0, to - 1s]`; to is constrained to `[from + 1s, total duration]`.
- [ ] The part within the export range is highlighted with a faint, transaprent overlay; the dimming does not block axis seek or lane pan.
- [ ] The Video tab zooms to the video window; the Activity tab zooms to the activity duration; both use 4% padding and a 2s minimum span.
- [ ] The Video tab is hidden when no video is imported; the Activity tab is hidden when there is no activity.
- [ ] Export markers use the new green theme token (added to the theme files); playhead stays orange, clips stay aqua/ice.
- [ ] Export-marker clamping and fit-video/fit-activity pure helpers have tests.

## Blocked by

- S2 — zoom controls + transport (needs the zoom/fit infrastructure and the toolbar left section for the new tabs)
- S4 — clip lanes (needs the lanes for export-marker dimming and for Video/Activity tab visibility)

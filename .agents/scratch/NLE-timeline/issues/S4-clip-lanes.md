# S4 — Video + Activity clip lanes

## Parent

PRD: `.agents/scratch/NLE-timeline/prd.md` · Spec: `.agents/scratch/NLE-timeline/spec.md`

## What to build

Render two clip lanes below the axis: a video lane on top and an activity lane on the bottom. Each lane shows at most one clip as a colored rectangle whose width equals the clip's duration and whose start matches its real offset — the video clip starts at the video sync offset, the activity clip starts at 0.

The video clip is labeled with the imported video file's basename; the activity clip is labeled with the activity filename (falling back to the activity summary filename, then a default) and the duration formatted properly - justify between. Long filenames are truncated with ellipsis and hidden entirely when the rectangle is too narrow; a hover tooltip shows the full filename and formatted duration. The video lane is omitted entirely when no video is imported. Clip geometry maps seconds to pixels via the visible window and culls clips fully outside the view. Clips are non-interactive — clicking a clip body does not seek. The video clip uses the aqua accent color; the activity clip uses the ice foreground color at low opacity.

This reuses the seconds-to-view-px helper and the visible window from the viewport hook introduced in S1; it adds a reusable lane component (used for both video and activity) and any clip-segment pure helpers needed. No playback-engine changes.

## Acceptance criteria

- [ ] Two lanes render below the axis; video on top, activity on bottom.
- [ ] Each clip's width equals its duration and its start matches its offset (video sync offset respected).
- [ ] Each clip should have a label in the beggining either a video play button or a text label for activity. If store provides this information easily, the text should be GPX/FIT/SRT/MP4 depending on what is the source of the activity. If not, use DATA for now.
- [ ] Video clip label = file basename; activity clip label = activity filename + duration formatted, justify-between.
- [ ] Long filenames truncate; text hides when the rectangle is too narrow; hover shows full name + duration.
- [ ] The video lane is omitted entirely when no video is imported.
- [ ] Clips are non-interactive; clicking a clip body does not seek.
- [ ] Video clip = aqua accent; activity clip = ice foreground at low opacity.
- [ ] Clip-geometry pure helpers (if any) have tests.

## Blocked by

- S1 — timeline skeleton

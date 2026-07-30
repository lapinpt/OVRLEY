# Negative Sync Offset Implementation Plan

## Product contract

- The timeline viewport must extend to `min(0, videoSyncOffsetSeconds)` when a video is imported.
- Users can scrub, pan, and place export markers in negative timeline seconds.
- Play and Reset start at the beginning of the video. For a `-5` offset, both start at `-5`.
- In the live editor, widgets remain visible and interactive outside the activity range, but activity-backed values display their normal missing-value default such as `--`.
- In the composite export, the overlay pixels are fully blank outside the activity range. The video remains visible.
- If activity ends before the video, the remaining video receives a blank overlay.
- Offsets with no video/activity overlap are rejected.
- Live preview preserves the existing frozen-final-video-frame behavior after the video ends.
- PNG preview is available only when the selected second contains activity data.
- Export ranges use activity-timeline seconds. The full-video range includes the negative lead-in.

For `videoSyncOffsetSeconds = -5` and a 30-second video:

```text
video timeline range:     -5 .. 25
activity data range:       0 .. 25
full output duration:    30 seconds
```

The full-video export range is `[-5, 25]`. A custom range beginning at `0` intentionally excludes the first five video seconds.

## 1. Establish the canonical timing model

Use one timing model for preview and rendering:

- Video timeline interval: `[syncOffset, syncOffset + videoDuration]`.
- Activity timeline interval: `[0, activityDuration]`.
- Video output duration remains the selected video duration.
- For a negative offset, the activity overlap is:

  ```text
  activityStart = 0
  activityEnd = min(activityDuration, syncOffset + renderDuration)
  ```

- Reject the configuration when `syncOffset + renderDuration <= 0`.

For each overlay frame at output index `i`, using overlay FPS `F`:

```text
timelineSecond = syncOffset + i / F
```

Frames before activity starts and after activity ends are blank. Frames inside the overlap use the corresponding dense activity frame.

## 2. Validate negative offsets at ingress

### Frontend

Update `app/src/features/render-video/utils/renderConfig.js`:

- Accept finite negative offsets.
- Validate that the video overlaps activity data.
- Do not silently clamp invalid offsets.
- Ensure changing to a shorter video cannot leave an invalid offset unnoticed.

The scene-settings/input owner should reject an offset at or below `-importedVideoDuration` once video metadata is available. The render-effective configuration should validate it again before IPC.

### Backend

Update `src-tauri/ovrley_core/src/encode/pipeline/composite_plan.rs`:

- Preserve existing zero/positive-offset behavior.
- For negative offsets, preserve the full output duration.
- Set `scene.start = 0`.
- Set `scene.end = min(activity_end, sync_offset + render_duration)`.
- Reject an empty overlap.
- Do not apply the existing near-activity-end duration-shortening behavior to negative offsets, because the full video must remain in the output.

Expose the derived activity overlap and blank-leading frame count on the composite plan so every downstream stage uses the same values.

## 3. Make the timeline visibly and interactively negative

Update the player timeline utilities and hooks:

- `app/src/features/player/hooks/useTimelineViewport.js`
- `app/src/features/player/utils/timelineViewport.js`
- `app/src/features/player/utils/timelineGeometry.js`
- `app/src/features/player/hooks/useTimelineGestures.js`
- Export-range marker logic
- Any fit-to-video and fit-to-all calculations

Use:

```text
timelineMinimum = hasVideo ? min(0, videoSyncOffsetSeconds) : 0
```

Required behavior:

- Viewport clamping respects `timelineMinimum`.
- Fit-to-video includes the negative video start.
- Pointer scrubbing can return negative seconds.
- Panning does not force the viewport back to zero.
- The video clip remains positioned at its negative start.
- The playhead is visible in the negative viewport.
- Negative timeline labels display as negative values, such as `-00:05`, rather than clamping to `00:00`.
- Activity-only timelines continue to use zero as their minimum.

## 4. Update playback behavior

Update `app/src/features/player/hooks/usePlaybackEngine.js`:

- Use the timeline minimum for all playhead clamps:
  - displayed playhead
  - selected playhead
  - stepping
  - scrubbing
  - scrub commit
  - timeline-clock updates
- Reset to the timeline minimum.
- Starting playback from the initial/activity-zero position begins at the video start when the offset is negative.
- Restarting after reaching the end also begins at the video start.
- Resuming from a paused position continues from that position.

Update `app/src/features/player/utils/playerTiming.js`:

- Remove the lower clamp from `videoStartSecond`.
- Select the video clock from the actual negative video interval.
- Preserve the existing timeline/video handoff behavior.

Verify that `useVideoPreview` still freezes the final video frame after the video range ends. This is existing behavior and should not be replaced.

## 5. Preserve the full interactive preview outside activity range

The live editor should continue rendering and interacting with widgets at every
playhead position. Negative and post-activity seconds are valid preview states;
they should not cause widgets, badges, selection, or moveable controls to be
hidden.

Update `app/src/lib/preview-timing.js`:

- Keep the existing preview-timing change that allows the finite selected
  second to flow through without clamping it to the activity interval.
- Do not add an out-of-range flag or use activity duration to gate the editor
  preview.

Keep `useOverlayEditorState.js`, `OverlayEditor.jsx`, and `OverlayCanvas.jsx`
rendering the normal widget and editor-interaction layers. No
`isActivityOutOfRange` state or canvas gate is needed.

Add a targeted preview-level boundary guard in
`app/src/features/overlay-editor/utils/overlayEditorUtils.js` so activity-backed
preview requests before the activity start or after the activity end return the
existing default value, such as `--`. This guard must run before the existing
interpolation/hold logic. Missing values inside the activity interval must keep
their current behavior, including boundary holding and interpolation policies.
Do not change the generic interpolation behavior globally.

The composite render path remains different: its blank leading and trailing
frames must still be fully transparent because the exported video has no
activity data in those regions.

## 6. Correct composite rendering

The relevant Rust files are under `src-tauri/ovrley_core/src/encode/pipeline/`; `VideoFrameRenderer` lives in `src-tauri/ovrley_core/src/render/mod.rs`.

### Dense activity construction

Update `src-tauri/ovrley_core/src/commands/mod.rs`:

- Request dense activity frames only for the derived activity-overlap duration.
- Keep the render/output frame count based on the complete video duration.

### Frame-count validation

Update `src-tauri/ovrley_core/src/encode/pipeline/composite.rs`:

- Do not broadly change `frame_count != task_count` to `frame_count > task_count`.
- Validate the dense count against the derived activity-overlap duration.
- Allow blank tail frames only when activity ends before the video.
- Reject inconsistent dense-frame counts rather than silently blanking arbitrary frames.

### VideoFrameRenderer

Update `src-tauri/ovrley_core/src/render/mod.rs`:

- Add the derived blank-leading frame count.
- For each output overlay frame:
  - Before activity starts: write a fully transparent frame.
  - During activity overlap: render dense frame `frameIndex - blankLeadInFrames`.
  - After activity ends: write a fully transparent frame.
- Do not restore the normal static base layer for blank frames, because it contains static overlay content.
- Derive the blank-leading count from the canonical FPS frame timeline. Do not use a plain `round()` calculation for fractional offsets.

## 7. Define export-range behavior

Treat export ranges as activity-timeline seconds.

For `offset = -5` and a 30-second video:

- Full video range: `[-5, 25]`.
- Activity-only range: `[0, 25]`.
- Custom range `[5, 20]`: exports only that timeline interval and trims the corresponding video section.

Update:

- Full-video/Use-video-range presets to include the negative start.
- Export-range marker bounds to use the negative timeline minimum.
- Render configuration tests and translation logic to preserve timeline semantics.

PNG preview behavior:

- Disable the PNG preview action when the selected second is outside `[0, activityDuration]`.
- No blank-PNG backend support is required.

## 8. Crucial tests only

### Frontend

Extend existing tests where practical:

1. Timeline viewport/geometry tests:
   - Negative viewport minimum.
   - Pointer scrubbing to a negative second.
   - Fit-to-video includes the negative start.
   - Negative time formatting.

2. Player timing/playback tests:
   - Negative video source interval.
   - Play and Reset begin at the negative video start.
   - Scrubbing and stepping do not clamp back to zero.
   - Frozen final video frame behavior remains intact after video end.

3. Preview/editor tests:
   - Negative and post-activity seconds keep widgets visible and interactive.
   - Activity-backed values display their missing-value default outside the
     activity interval.
   - Missing values inside the activity interval retain their current behavior.
   - In-range seconds render normally.

4. Render configuration tests:
   - Full negative video range becomes `[-5, 25]`.
   - Custom ranges translate correctly.
   - No-overlap offsets fail.

### Backend

5. Composite-plan tests:
   - `offset=-5`, video30, activity30 produces activity scene `0..25` and output duration30.
   - Activity shorter than video produces a blank render tail.
   - No overlap returns an error.
   - Zero and positive offsets retain existing behavior.

6. One focused renderer/mapping test:
   - Leading frames are transparent.
   - Activity frames use the shifted dense index.
   - Trailing frames are transparent.
   - Static base content is absent from blank frames.

Existing positive-offset and general render tests remain the primary regression coverage; no large new fixture matrix is needed.

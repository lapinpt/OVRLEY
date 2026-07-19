or the composite hardware-export path only, this is a medium backend refactor—not a renderer rewrite.

My estimate:

Scope Production code Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━
Proof of concept 120–200 lines Minimal
────────────────────────────────────── ───────────────── ───────────────
Production-ready composite path 300–500 lines 150–300 lines
────────────────────────────────────── ───────────────── ───────────────
Both composite and transparent paths 500–800 lines 250–450 lines

The frame indices already exist as overlay_frame_index in /H:/tools/cyclemetry/src-tauri/ovrley_core/src/encode/video_composite_pipeline.rs:288, so no new timeline or data
model is needed. render_frame_rgba already accepts an arbitrary frame index and caller-owned buffer, which is exactly the worker boundary we need.

The production change would likely touch five areas:

- Add a focused frame_render_pool.rs helper containing:
  - FrameTask { overlay_index, dense_frame_index }
  - RenderedFrame { overlay_index, buffer }
  - N scoped workers
  - Per-worker RenderProfiler
  - Worker error and cancellation events

- Replace the serial hot loop in /H:/tools/cyclemetry/src-tauri/ovrley_core/src/encode/video_composite_pipeline.rs:328 with a coordinator that:
  - Receives completed frames
  - Stores out-of-order frames in a BTreeMap
  - Sends consecutive frames to the existing FFmpeg writer
  - Updates progress monotonically
  - Polls FFmpeg liveness

- Adapt the reusable buffer pool for multiple consumers. The smallest implementation could wrap the existing free-buffer receiver in Arc<Mutex<\_>>. A cleaner implementation
  would add a direct crossbeam-channel dependency and use its MPMC channels.

- Merge N worker timing summaries. The existing merge_timing_maps utility already handles most of this.
- Change dispatch policy. Right now hardware codecs of sufficient duration are sent to segmentation before reaching the single-pass pipeline in /H:/tools/cyclemetry/src-
  tauri/ovrley_core/src/encode/video.rs:78. That policy must select the frame-worker path, or expose both paths for benchmarking.

The genuinely tricky code is not drawing frames. It is:

- Preserving strict frame order
- Avoiding deadlocks after one worker fails
- Distinguishing internal worker failure from user cancellation
- Closing FFmpeg stdin correctly
- Joining every worker during cancellation
- Calculating ETA from parallel throughput rather than individual frame duration

I would add tests for out-of-order completion, worker failure, cancellation while workers are blocked, bounded memory, exact frame count, and deterministic output order.
Existing end-to-end composite tests would cover much of the FFmpeg lifecycle.

No widget renderer changes, frontend changes, IPC changes, or config-shape changes are inherently required. Worker count can initially reuse the existing conservative worker
estimator in /H:/tools/cyclemetry/src-tauri/ovrley_core/src/encode/video_parallel.rs:100.

One optional follow-up would be removing the global typeface-cache mutex from the concurrent hot path. That is a performance refinement, not required for correctness, and I
would keep it separate from the initial worker-pool change.

So I would characterize it as one reviewable feature-sized change: probably a new helper module plus a substantial replacement of the composite render loop, rather than a
broad architectural rewrite.

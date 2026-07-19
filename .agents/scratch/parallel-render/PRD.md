Status: ready-for-human

# Parallel Frame Rendering Proof of Concept

## Prototype status

This is intentionally a throwaway proof of concept for the composite hardware-export path. It must be clean enough that the frame-worker module and its contracts can be promoted into production if the benchmark is favorable, but it is not expected to be feature-complete or hardened for every failure mode.

The prototype must be clearly marked `PROTOTYPE` in new Rust module documentation. The default application behavior must remain the current segmented export path when the prototype switch is absent.

## Question to answer

Does one composite export using `N` concurrent CPU frame-render workers feeding a single FFmpeg process complete materially faster than the current approach of splitting the export into parallel segments, where each segment owns its own serial Skia renderer and FFmpeg process?

The benchmark must distinguish these two coarse explanations:

1. Frame workers are faster because the current single Skia producer starves one otherwise-capable FFmpeg/GPU pipeline.
2. Segments remain faster because multiple FFmpeg decode/filter/encode sessions provide parallelism that one fully-fed FFmpeg process cannot match.

End-to-end export wall time is the primary measure. Internal frame-render and pipe-wait measurements are diagnostic evidence, not substitutes for end-to-end time.

## Hypothesis

Rendering independent overlay frames concurrently should raise CPU utilization and keep the single FFmpeg pipeline supplied without duplicating source decode, hardware-filter, encoder, and stitching work. It should perform best when current timing summaries show expensive `frame.draw` work and little FFmpeg write backpressure.

The hypothesis is rejected for a codec/machine combination if an adequately sized worker pool keeps the frame queue supplied but remains materially slower than current segmentation.

## Scope

### In scope

- Composite MP4 rendering only.
- Current hardware-accelerated codec profiles.
- One FFmpeg process for frame-worker mode.
- `N` CPU render workers, initially restricted to `1..=4`.
- Strict chronological delivery of rendered RGBA frames to FFmpeg.
- Reuse of the existing prepared render assets and RGBA buffer pool.
- A simple runtime switch between current segmentation and frame-worker mode.
- A dedicated benchmark command that runs and compares both strategies on the same activity, template, video, codec, render window, and bitrate.
- End-to-end timing plus enough internal timing to tell whether FFmpeg is waiting for CPU frames or the CPU is waiting for FFmpeg.
- Minimal correctness tests around switch parsing, frame ordering, and one small end-to-end frame-worker export.

### Out of scope

- Transparent-overlay exports.
- A frontend setting or persisted user preference.
- Automatic or adaptive worker-count selection.
- More than four render workers.
- Dynamic memory budgeting.
- Perfect recovery from worker panics, poisoned mutexes, or every channel-disconnect ordering.
- Replacing the current segmented implementation.
- Removing or redesigning the global typeface cache.
- GPU utilization sampling inside OVRLEY.
- Byte-identical comparison of lossy encoded outputs.
- Production telemetry, release behavior, or long-term compatibility for the prototype switch.

## Existing seams to reuse

- `render_composite_video` in `src-tauri/ovrley_core/src/encode/video.rs` already owns the choice between segmented and single-pass composite rendering.
- `render_composite_video_single` in `src-tauri/ovrley_core/src/encode/video_composite_pipeline.rs` already owns the reusable asset preparation, FFmpeg process, writer thread, monitor thread, final verification, and timing summary.
- `overlay_frame_index` and `dense_frame_index_for_overlay` already define the required frame-to-activity mapping. No new timeline model is required.
- `render_frame_rgba` already renders any requested dense frame into a caller-owned RGBA buffer. Each worker can call it with a worker-local borrowed raster surface.
- `FrameBuffer`, `acquire_frame_buffer`, `queue_frame`, `writer_worker`, and `merge_timing_maps` in `pipeline_shared.rs` provide the current buffer and timing infrastructure.
- `estimate_composite_segment_count` exposes the segment count used by the current strategy and should be reported by the benchmark.
- `benchmark_composite.rs`, `benchmark_common.rs`, and `bin_common.rs` establish argument, codec-detection, fixture, sleep-prevention, and JSON-output conventions.

## Runtime strategy switch

Add one prototype-only environment variable:

```text
OVRLEY_COMPOSITE_PARALLEL_MODE=segments
OVRLEY_COMPOSITE_PARALLEL_MODE=frames:1
OVRLEY_COMPOSITE_PARALLEL_MODE=frames:2
OVRLEY_COMPOSITE_PARALLEL_MODE=frames:3
OVRLEY_COMPOSITE_PARALLEL_MODE=frames:4
```

Contract:

- Absence is documented optionality and selects `segments`, preserving current behavior.
- `segments` runs the current dispatcher unchanged: eligible hardware renders are segmented and ineligible renders retain the existing single-pass fallback.
- `frames:N` bypasses segmented dispatch and runs one composite FFmpeg pipeline with exactly `N` frame workers.
- Present malformed values fail loudly with `CoreError::Encode`. Do not silently select a default, clamp a number, accept aliases, or fall back to segmentation.
- `N` must be an integer in `1..=4`. The four-worker limit matches the current segment-worker cap and keeps the existing five-buffer composite pool sufficient for the prototype.

Represent the parsed value canonically:

```rust
pub enum PrototypeCompositeParallelMode {
    Segments,
    FrameWorkers { workers: NonZeroUsize },
}
```

Place the enum and pure parser in the new prototype module rather than spreading string comparisons through dispatch and benchmark code.

Expose a `#[doc(hidden)]` explicit-strategy render entry point for the benchmark. Normal application dispatch reads the environment variable once and delegates to that entry point. The benchmark calls the explicit entry point directly, so it does not mutate process-global environment state between threaded renders.

Suggested shape:

```rust
pub fn render_composite_video(request: &CompositeRenderRequest<'_>) -> CoreResult<String> {
    let mode = PrototypeCompositeParallelMode::from_optional_env()?;
    render_composite_video_with_prototype_mode(request, mode)
}

#[doc(hidden)]
pub fn render_composite_video_with_prototype_mode(
    request: &CompositeRenderRequest<'_>,
    mode: PrototypeCompositeParallelMode,
) -> CoreResult<String> {
    // Explicit strategy dispatch.
}
```

The exact ownership signature may differ, but there must be one parser and one explicit strategy decision.

## Required module boundary

Create:

```text
src-tauri/ovrley_core/src/encode/video_frame_parallel_prototype.rs
```

This file owns all new frame-worker behavior:

- Prototype strategy enum and strict parser.
- Frame task and completion event types.
- Atomic task allocation.
- Worker spawning and joining.
- Worker-local `RenderProfiler` instances.
- Shared access to the reusable free-buffer receiver.
- Out-of-order completion buffering.
- Ordered forwarding to the existing FFmpeg writer queue.
- Local stop signaling distinct from user cancellation.
- Parallel-phase timing results.

It must not own:

- FFmpeg argument construction.
- FFmpeg process spawning or finalization.
- Codec selection.
- Segment rendering or stitching.
- Activity normalization.
- Render asset preparation.
- Final output verification.

Register the module in `src-tauri/ovrley_core/src/encode/mod.rs` as `pub` with `#[doc(hidden)]` only where the benchmark binary needs access. Keep worker implementation details `pub(crate)`.

## Common composite-pipeline integration

Do not copy `render_composite_video_single` into the prototype file. Preserve one owner for FFmpeg lifecycle and composite setup.

Refactor `video_composite_pipeline.rs` just enough to support two frame producers:

1. Keep the existing `render_composite_video_single` entry point and behavior for segment workers and all existing callers.
2. Add an internal common composite pipeline function that accepts an explicit frame-producer mode.
3. Have `render_composite_video_single` call the common function with the existing serial producer.
4. Add a prototype frame-worker entry point that calls the same common function with `FrameWorkers { workers }`.
5. In the common function, keep phases 1-3 and 5-6 shared. Only phase 4, frame production, branches.

Suggested internal mode:

```rust
enum CompositeFrameProducer {
    Serial,
    PrototypeWorkers(NonZeroUsize),
}
```

Do not let segmented child renders consult the environment variable. They must continue calling the explicit serial entry point; otherwise `N` frame workers could be multiplied by the number of segments.

## Frame task preparation

Before spawning frame workers, build the exact task list on the coordinator thread:

```rust
struct FrameRenderTask {
    overlay_index: u64,
    dense_frame_index: usize,
}
```

For every guarded overlay frame:

1. Compute `video_local_time` from `overlay_index / overlay_pipe_fps`.
2. Compute `activity_time` from sync offset plus video-local time.
3. Call the existing `dense_frame_index_for_overlay` exactly once.
4. Store both canonical indices in the task.

This keeps timing/normalization in its current owner, fails before worker startup if the dense mapping is invalid, and ensures workers perform presentation work only.

The task list is small relative to RGBA buffers and may be a `Vec<FrameRenderTask>` for the prototype.

## Worker and buffer design

Use only the standard library for this proof of concept. Do not introduce Rayon or Crossbeam before knowing whether the approach is viable.

### Shared state

- `&[FrameRenderTask]` borrowed through `std::thread::scope`.
- Read-only `AppPaths`, `DenseActivityReport`, and `PreparedRenderAssets` borrowed through the same scope.
- `AtomicUsize` task cursor.
- `Arc<AtomicBool>` local stop flag.
- Existing controller cancellation flag.
- Existing free-buffer `Receiver<FrameBuffer>` wrapped in `Arc<Mutex<_>>`, because the standard receiver is not `Sync`.
- Unbounded standard MPSC event channel from workers to the coordinator. The fixed RGBA buffer pool provides the actual memory bound.

### Why the receiver mutex is acceptable here

The five composite buffers are populated before workers start. Up to four workers can immediately acquire one buffer each. Once the pipeline is active, buffers return one at a time from the writer, so serializing only buffer acquisition is unlikely to be the dominant cost. The benchmark will determine whether this simple design is adequate. If viable but contended, promotion work can replace it with a true MPMC channel.

### Worker loop

Each worker:

1. Checks user cancellation and the local stop flag.
2. Acquires one free buffer with a short timeout so stop/cancel remains observable.
3. Claims the next task index with `fetch_add` only after it owns a buffer.
4. Exits when the task cursor is beyond the task list.
5. Calls `render_frame_rgba` using the task's `dense_frame_index` and a worker-local `RenderProfiler`.
6. Records `frame.total` around acquire plus render and records a prototype-specific `parallel.worker_frame` timing for clarity.
7. Sends a `Rendered` event containing the overlay index, completed buffer, and completion timestamp.
8. Repeats until work is exhausted or stopped.
9. Returns its profiler summary when joined.

The worker must create and destroy every borrowed `Surface` on the same worker thread through the existing `render_frame_rgba` call. Never share a `Surface` or `Canvas` between workers.

Buffer acquisition must precede task allocation. Claiming an index first can deadlock the bounded pool: a descheduled worker may own the missing earliest index without owning a buffer, while later completed frames retain every buffer in the reorder map waiting for that missing index.

### Worker events

Use one canonical event shape:

```rust
enum FrameWorkerEvent {
    Rendered {
        overlay_index: u64,
        buffer: FrameBuffer,
        completed_at: Instant,
    },
    Failed {
        overlay_index: u64,
        error: CoreError,
    },
}
```

Normal worker completion comes from joined handles rather than a second naming scheme for completion messages.

## Ordered coordinator

The coordinator remains on the composite render thread and owns:

- `next_overlay_index_to_write`.
- `BTreeMap<u64, CompletedFrame>` for out-of-order results.
- Progress and ETA updates.
- FFmpeg child liveness polling.
- Forwarding ordered buffers through the existing `queue_frame` function.
- First-error selection and local stop signaling.

Coordinator loop:

1. Receive worker events with a short timeout.
2. On timeout, check controller cancellation, local stop, FFmpeg `try_wait`, and whether every worker handle has finished unexpectedly.
3. On `Rendered`, reject indices outside the task range and reject duplicate indices.
4. Insert the frame into the reorder map.
5. Repeatedly remove `next_overlay_index_to_write` while it is ready.
6. Record `parallel.reorder_hold` as the duration between worker completion and ordered forwarding.
7. Send each ready buffer to the existing writer queue.
8. Advance progress only for ordered frames.
9. Exit successfully only after every expected overlay frame has been forwarded.

Do not emit a generated frame, skip a missing frame, or send later frames out of order. A missing required index is an error.

### Progress calculation

Parallel completions may arrive in bursts, so do not feed individual worker render durations into the existing serial ETA estimator.

For each ordered batch drained from the reorder map:

1. Measure wall time since the previous progress update.
2. Divide by the output-frame-equivalent progress added by the batch.
3. Pass that throughput sample and total elapsed wall time to `ProgressEstimator` once per batch.
4. Report the progress associated with the last frame in the batch.

Exact UI smoothness is not a prototype goal, but progress must remain monotonic and finish at the existing output-frame total.

## Cancellation and errors

Keep two separate signals:

- The existing controller cancellation flag means the user cancelled.
- A prototype-local stop flag means a worker, coordinator, or FFmpeg failure requires sibling workers to stop.

On the first worker failure:

1. Preserve the original `CoreError`.
2. Set the local stop flag.
3. Stop accepting new ordered output.
4. Join all workers.
5. Return the preserved render error to the common composite pipeline.

On user cancellation:

1. Set/observe the existing cancellation flag.
2. Set the local stop flag.
3. Join all workers.
4. Return `CoreError::Cancelled`.

Once the parallel producer returns, the existing pipeline remains responsible for dropping the FFmpeg frame sender, joining the writer, terminating or waiting for FFmpeg, removing partial output, and returning the final error.

This proof of concept does not need a watchdog for a worker stuck inside native Skia code. It must, however, avoid ordinary channel/buffer deadlocks during handled Rust errors.

## Profiling changes

### Primary benchmark measurement

Measure one `Instant` around the entire public composite render call. This includes:

- Per-render preparation.
- Skia frame production.
- Source decode and filters.
- Hardware encoding.
- FFmpeg finalization.
- Segment stitching and segment cleanup in current mode.

This end-to-end wall time is the canonical comparison.

### Existing and new diagnostic buckets

Retain existing buckets and add:

- `parallel.worker_frame`: acquire plus render time for one worker task.
- `parallel.result_wait`: coordinator time waiting for the next worker event.
- `parallel.reorder_hold`: time a completed frame waits for preceding indices.
- `encoder.queue_wait`: writer time waiting for a rendered frame.

Enable the currently disabled composite writer `queue_wait_metric` so `encoder.queue_wait` is present for both serial segment children and frame-worker mode.

Interpretation:

- High `encoder.queue_wait` in frame-worker mode means FFmpeg is being starved by CPU production.
- High `ffmpeg.write` means the CPU-side writer is blocked because FFmpeg is consuming slowly.
- High `parallel.reorder_hold` means frame-time variance or task scheduling is creating head-of-line stalls.
- High `frame.draw` with low write backpressure indicates the worker count may still be too small.

`render_loop_ms` remains the wall time for the complete frame-production phase, regardless of producer mode.

Add `frame_render_mode` and `frame_render_workers` to the composite timing-summary diagnostics. Use `0` workers for the serial producer rather than omitting a required diagnostic field.

## Dedicated benchmark binary

Create:

```text
src-tauri/ovrley_core/src/bin/benchmark_parallel_render.rs
```

Mark it as a prototype benchmark in its module documentation. It should reuse the existing benchmark conventions and helpers, but it must be narrowly focused on one selected composite hardware profile rather than iterating over every codec.

### Command

Add this root script:

```json
"benchmark:parallel-render": "cd src-tauri && cargo run --release -p ovrley_core --bin benchmark_parallel_render --"
```

Invocation:

```powershell
pnpm benchmark:parallel-render -- <activity-path> <template-path> <video-path> --codec <profile> --workers <N> --runs 3
```

Example:

```powershell
pnpm benchmark:parallel-render -- debug/activity.json templates/example.json debug/source.mp4 --codec nvgpu_h264 --workers 4 --runs 3
```

The benchmark command performs a release compilation. Under the repository instructions, an agent must obtain explicit user permission before executing it.

### CLI contract

- The first three positional arguments are required and retain the conventions of `benchmark_composite`.
- `--codec` is required and must resolve through the canonical composite codec catalog.
- `--workers` is required and must be in `1..=4`.
- `--runs` is optional and defaults to `3`; malformed present values fail.
- `--strategy segments|frame_workers` is optional. When present, run only that strategy so baselines and prototype failures can be isolated. When absent, retain the paired warm-up and alternating comparison protocol below.
- Use a 60-second render window by default, using the same source-window selection as `benchmark_composite`.
- Reject benchmark inputs for which current segmented dispatch would not actually create at least two segments. This prevents a mislabeled comparison against the serial fallback.
- Detect codec availability before any measured run and fail if the selected hardware profile is unavailable.
- Inject QSV full-overlay initialization arguments using the same detected values and canonical config fields as `benchmark_composite`.

### Run protocol

For each measured round, run both strategies against newly cloned but otherwise identical validated config:

- `PrototypeCompositeParallelMode::Segments`
- `PrototypeCompositeParallelMode::FrameWorkers { workers: N }`

Alternate order by round to reduce fixed first-run bias:

- Odd rounds: segments, then frame workers.
- Even rounds: frame workers, then segments.

Run one unmeasured warm-up for each strategy before measured rounds. Preserve the resulting filenames for manual inspection but label them as warm-up results and exclude them from summary statistics.

Use the existing benchmark cooldown helper between measured pairs. Do not introduce background load or attempt to control CPU affinity in this proof of concept.

### Per-run validation

A run counts as successful only when:

- The render call returns success.
- The output file exists and is non-empty.
- The controller reaches `current == total == encoded`.
- The output probe reports the expected rational FPS.
- Output duration is within one source-frame duration of the planned render duration.

Do not compare encoded bytes or require equal output file sizes. Segment boundaries reset encoder state, so lossy bitstreams and sizes may legitimately differ.

### Benchmark output

Write a timestamped result instead of overwriting the existing composite benchmark:

```text
debug/benchmarks/parallel-render/<timestamp>.json
```

Required JSON fields:

```text
generated_at
question
activity
template
video.path
video.fps_num
video.fps_den
video.duration_seconds
codec.profile_name
codec.ffmpeg_codec_name
bitrate
resolution
widget_update_rate
render_window.start
render_window.end
render_window.duration_seconds
output_frame_count
overlay_frame_count
logical_parallelism
segment_count
frame_worker_count
runs[]
summaries.segments
summaries.frame_workers
comparison
```

Each measured or warm-up run records:

```text
round
warmup
strategy
workers
success
wall_time_seconds
output_equivalent_fps
overlay_equivalent_fps
file_size_mb
output_filename
progress_current
progress_total
progress_encoded
error
```

Each strategy summary records successful-run count, failed-run count, mean wall time, median wall time, fastest wall time, and mean output-equivalent FPS.

`comparison` records:

```text
frame_workers_over_segments_speedup = segments_median_seconds / frame_workers_median_seconds
frame_workers_wall_time_change_percent
```

Do not automatically label the result pass/fail in JSON. Preserve measurements and let the decision criteria below drive the conclusion.

Print a concise terminal summary after writing JSON:

```text
Segments median:       42.10 s
Frame workers median:  31.25 s (N=4)
Speedup:               1.35x
Wall-time change:      -25.8%
Results:               debug/benchmarks/parallel-render/<timestamp>.json
```

## Minimal tests

The user explicitly requested minimal tests; do not build a production-scale concurrency test suite.

### 1. Pure switch-parser test

Test the pure parser without mutating environment variables:

- Accept `segments`.
- Accept `frames:1` and `frames:4`.
- Reject `frames:0`, `frames:5`, `frames`, `parallel`, empty present text, and non-integer worker text.

### 2. Pure ordered-buffer test

Keep the ordered-result helper small enough to test with non-frame payloads. Insert indices `2`, `0`, then `1` and verify emitted order is exactly `0`, `1`, `2`. Verify a duplicate index is rejected.

Do not add generated identities, missing-index repair, or a timeout fallback to this helper.

### 3. One short end-to-end frame-worker test

Add one small composite integration case using two frame workers and the existing software test fixture/profile so the test is not dependent on hardware availability. Verify:

- The output exists and is non-empty.
- Progress reaches its exact expected total.
- The output probe retains expected FPS.
- The render completes without segmentation.

Keep the clip short enough to add only a few overlay frames. Existing tests remain responsible for detailed timing, trim, audio, and cancellation behavior.

### Tests deliberately omitted

- Worker panic injection.
- Cancellation during every channel state.
- Buffer-pool exhaustion stress.
- More than four workers.
- Hardware-specific CI tests.
- Pixel-level output comparison.
- Long-duration or thermal benchmark assertions.

## Implementation sequence

### Step 1: Add prototype strategy contract

1. Create `video_frame_parallel_prototype.rs` with the prototype warning, question, strategy enum, worker-count bound, and pure parser.
2. Register the module in `encode/mod.rs`.
3. Add parser unit tests.
4. Add the explicit-strategy dispatcher in `video.rs`.
5. Preserve environment-variable absence as current segmented behavior.

Checkpoint: Existing callers compile without selecting prototype mode, and malformed present switch values fail before rendering starts.

### Step 2: Split common composite lifecycle from frame production

1. Introduce the internal serial-versus-workers producer mode in `video_composite_pipeline.rs`.
2. Move the existing function body into a common internal pipeline without changing phases 1-3 or 5-6.
3. Keep `render_composite_video_single` as the serial wrapper used by segments.
4. Add the frame-worker wrapper used only by explicit prototype dispatch.
5. Confirm the current segmented path cannot recursively activate frame workers.

Checkpoint: Serial and segmented behavior are structurally unchanged when the switch is absent or `segments`.

### Step 3: Implement task preparation and worker rendering

1. Build exact frame tasks before spawning workers.
2. Wrap the existing free-buffer receiver for shared acquisition.
3. Spawn `N` scoped workers with an atomic cursor and worker-local profiler.
4. Render task frames through the existing `render_frame_rgba` API.
5. Return completed frames through one event channel.
6. Join workers and merge profiler maps.

Checkpoint: With one worker, the new producer writes the same number of overlay frames as the serial producer.

### Step 4: Add ordered coordination and shutdown

1. Add the reorder map and exact next-index counter.
2. Drain only consecutive frames to the existing FFmpeg queue.
3. Add local stop signaling and first-error preservation.
4. Poll cancellation and FFmpeg liveness while waiting for events.
5. Update progress in ordered batches.
6. Return the parallel timing map and render-loop wall time to the common pipeline.

Checkpoint: The pure reorder test passes, and the short end-to-end test produces a valid output with exact progress.

### Step 5: Add diagnostic timings

1. Enable composite writer `encoder.queue_wait` timing.
2. Record worker, coordinator-result-wait, and reorder-hold buckets.
3. Add frame-render mode and worker count to composite diagnostics.
4. Keep end-to-end wall time as the benchmark's primary value.

Checkpoint: A frame-worker timing summary contains `frame.draw`, `parallel.worker_frame`, `parallel.result_wait`, `parallel.reorder_hold`, `encoder.queue_wait`, and `ffmpeg.write` when those operations occur.

### Step 6: Add the dedicated benchmark

1. Create `benchmark_parallel_render.rs` using existing benchmark setup helpers and canonical codec metadata.
2. Add strict CLI parsing and eligibility checks.
3. Run warm-ups and alternating measured pairs.
4. Validate each output.
5. Write timestamped JSON and print comparison summary.
6. Add the root `benchmark:parallel-render` script using a release build.

Checkpoint: One command produces both strategy results and a median speedup ratio without overwriting other benchmark artifacts.

### Step 7: Run only with explicit permission

Because repository instructions prohibit builds without user permission, the implementing agent must stop and request permission before running Rust tests or the release benchmark command.

After permission:

1. Run targeted parser/reorder tests.
2. Run the short composite frame-worker integration test.
3. Run the dedicated release benchmark with a representative hardware profile and `N` equal to the current segment count.
4. Repeat with other worker counts only if the first comparison suggests CPU-feed scaling remains relevant.

## Benchmark interpretation

Use median end-to-end wall time as the primary comparison.

### Strong evidence to continue

- Frame workers are at least 10% faster than segments, or
- Frame workers are within 5% of segments while eliminating meaningful stitch/multi-session overhead and diagnostic timings show clear remaining tuning headroom.

### Inconclusive

- Difference is within approximately 5% and run-to-run spread overlaps.
- `encoder.queue_wait` remains high, suggesting the chosen `N` is insufficient.
- Thermal throttling or other system load visibly affected one strategy.

Repeat with a longer render or another worker count before deciding.

### Evidence to stop

- Frame workers are more than 10% slower with low `encoder.queue_wait` and sustained `ffmpeg.write` backpressure. This means CPU frames are already arriving fast enough and the single FFmpeg pipeline is the limiting path.
- Frame workers consume substantially more memory or become unstable before matching segment throughput.
- Reorder hold time dominates enough to erase parallel render gains.

## Promotion path if viable

If the benchmark supports frame rendering, retain the worker module's task, event, ordering, and timing contracts, then replace prototype plumbing deliberately:

1. Replace the environment switch with an internal production strategy policy or validated config owned at render ingress.
2. Rename the module to `video_frame_parallel.rs` and remove prototype markers.
3. Replace the mutex-wrapped standard receiver with a true bounded MPMC queue if profiling shows acquisition contention.
4. Derive worker count from physical cores, frame memory, codec behavior, and measured backpressure.
5. Harden cancellation, worker panic handling, and unexpected FFmpeg exit paths.
6. Resolve typefaces/fonts during preparation if the global typeface-cache mutex limits scaling.
7. Add broader integration and cancellation tests.
8. Decide per codec whether frame workers replace segmentation or coexist as separate strategies.
9. Consider applying the same producer to transparent exports only after composite behavior is validated.

If the benchmark rejects the approach, remove the environment switch, prototype module, benchmark binary, root script, and prototype-only tests together. Preserve the benchmark JSON and record the verdict in this PRD or the implementation issue before deleting code.

## Expected files changed

New:

```text
src-tauri/ovrley_core/src/encode/video_frame_parallel_prototype.rs
src-tauri/ovrley_core/src/bin/benchmark_parallel_render.rs
```

Modified:

```text
src-tauri/ovrley_core/src/encode/mod.rs
src-tauri/ovrley_core/src/encode/video.rs
src-tauri/ovrley_core/src/encode/video_composite_pipeline.rs
src-tauri/ovrley_core/src/encode/video_composite_debug.rs
src-tauri/ovrley_core/src/encode/pipeline_shared.rs
src-tauri/ovrley_core/tests/video_composite_pipeline_tests.rs
package.json
```

`pipeline_shared.rs` should change only if enabling writer queue-wait timing or sharing an existing helper requires it. Do not generalize shared infrastructure solely for hypothetical future use.

## Completion criteria

- Default exports retain current segmented behavior.
- `segments` explicitly selects current behavior.
- `frames:N` selects one FFmpeg process with exactly `N` CPU frame workers.
- The worker implementation lives in its own clearly marked prototype file.
- Rendered frames reach FFmpeg in exact chronological order.
- The frame-worker path produces a valid short composite output and exact progress.
- One release benchmark command runs both strategies against identical inputs.
- Timestamped JSON reports raw runs, strategy summaries, and speedup.
- Timing diagnostics distinguish CPU starvation, FFmpeg backpressure, and reorder delay well enough to explain the result.
- No frontend or persistent configuration is added.
- The benchmark result and viability verdict are appended to this document before the prototype is promoted or removed.

## Results

Benchmark date: 2026-07-18 (Europe/Berlin).

Inputs and configuration:

- Parsed activity: `debug/activities/Test_FIT-parse-debug.json`
- Template: `src-tauri/ovrley_core/tests/fixtures/config/test-template-4k.json`
- Source video: `src-tauri/ovrley_core/tests/fixtures/video/test-4k.mp4`
- Source/render window: 3840x2160, 30000/1001 FPS, 58.491767 seconds
- Codec: canonical profile `nvgpu_h264`, FFmpeg encoder `h264_nvenc`
- Bitrate: `40M`
- Current segmented workers: 3
- Prototype frame workers: 3
- Logical parallelism reported by the machine: 12

The strategies were measured in separate invocations using the optional `--strategy` selector. Each invocation ran three measured exports with the existing 60-second cooldown between runs and no warm-up from the other strategy.

Current segmented pipeline report: `debug/benchmarks/parallel-render/1784409998.json`

| Run | Wall time | Output-equivalent FPS | Result |
| --- | ---: | ---: | --- |
| 1 | 71.7133 s | 24.4585 | Valid |
| 2 | 72.1980 s | 24.2943 | Valid |
| 3 | 73.2913 s | 23.9319 | Valid |

Segmented median: **72.1980 s**. Mean: **72.4009 s**.

Three-worker prototype report: `debug/benchmarks/parallel-render/1784410684.json`

| Run | Wall time | Output-equivalent FPS | Result |
| --- | ---: | ---: | --- |
| 1 | 63.4520 s | 27.6430 | Valid |
| 2 | 62.9728 s | 27.8533 | Valid |
| 3 | 62.7284 s | 27.9618 | Valid |

Frame-worker median: **62.9728 s**. Mean: **63.0511 s**.

All six measured runs returned success, reached exact progress `current == total == encoded == 1754`, produced non-empty outputs, and passed the benchmark's FPS and duration probe. Segmented outputs were 282.674 MiB each; frame-worker outputs were 281.211 MiB each. The size difference is expected and is not used as a correctness or performance criterion.

Comparison using the separately recorded medians:

- Frame-worker wall time change: **-12.78%**
- Frame-worker throughput speedup: **1.146x**

An additional isolated segmented confirmation run completed in **71.6899 s** and is recorded in `debug/benchmarks/parallel-render/1784411021.json`. Across all four segmented measurements, the mean is **72.2231 s**, the median is **71.9557 s**, and the full range is **1.6013 s** (2.22% of the mean). Comparing the four-run segmented median with the unchanged three-run frame-worker median gives a **-12.48%** wall-time change and **1.143x** throughput speedup. The confirmation output also passed validation and matched the earlier segmented output size.

One isolated four-worker run completed in **66.5736 s** and is recorded in `debug/benchmarks/parallel-render/1784411162.json`. It passed the same output and progress validation, but was **5.72% slower** than the three-worker median. It remained **7.48% faster** than the four-run segmented median. For this machine and fixture, raising `N` from 3 to 4 adds contention rather than useful throughput.

One isolated two-worker run completed in **63.8905 s** and is recorded in `debug/benchmarks/parallel-render/1784411480.json`. It passed output and progress validation, was **1.46% slower** than the three-worker median, **4.03% faster** than the four-worker run, and **11.21% faster** than the four-run segmented median. Its encoder queue waited only **31.38 ms total** across the full export, confirming that two workers also kept FFmpeg continuously supplied. N=2 and N=3 therefore occupy the efficient plateau for this fixture; N=3 has the best measured time, while N=2 may offer similar throughput at lower CPU utilization.

The two pathways were also run once with the full-CUDA `nnvgpu_h264` profile. Segmentation completed in **32.9486 s** (`debug/benchmarks/parallel-render/1784411875.json`), while one FFmpeg process with three frame workers completed in **31.0696 s** (`debug/benchmarks/parallel-render/1784411923.json`). Both passed output and exact-progress validation. Frame workers were **5.70% faster** than segmentation in this single-round comparison. More importantly, moving source decode and compositing to CUDA reduced wall time by roughly half relative to the CPU-overlay `nvgpu_h264` measurements. In the full-CUDA frame-worker run, `ffmpeg.write` averaged **17.54 ms/frame** versus roughly **35.7 ms/frame** for the CPU-overlay N=3 runs; encoder queue wait remained negligible at **33.48 ms total**.

An initial frame-worker attempt reproduced an ordinary buffer/reorder deadlock after only a few seconds of useful work. Workers allocated task indices before acquiring buffers. A worker could therefore own the missing earliest index while waiting for a buffer, with every buffer retained by later out-of-order results. Both the benchmark and FFmpeg remained alive but idle, leaving an unfinalized partial MP4 when manually terminated. Reordering the worker loop to acquire a buffer before allocating an index removed the cycle; all three subsequent measured runs completed.

The release benchmark compilation and eleven full measured output validations succeeded. The dedicated parser/reorder unit tests and short software integration test were added but were not separately executed during this benchmark session.

## Verdict

**Continue toward production hardening for the tested H.264 NVENC path.** The three-worker prototype reduced median end-to-end wall time by 12.78% on the CPU-overlay profile, exceeding the plan's 10% threshold for strong evidence to continue. A preliminary full-CUDA comparison retained a smaller 5.70% frame-worker advantage, while showing that decode/filter-stack placement has a much larger impact than either parallelization topology.

This is evidence for one machine, one 4K fixture, two H.264 NVENC filter stacks, and worker counts 2 through 4 on the CPU-overlay stack; it is not yet evidence for other codecs, resolutions, one worker, cancellation behavior, or automatic strategy selection. Before replacing segmentation, run the omitted tests, repeat the full-CUDA comparison, test a longer representative input, and benchmark any other codec that would use the policy.

## Comments

- The pre-existing `summary.md` in this directory contains the initial sizing discussion and should remain as background context.
- This plan intentionally allows a small amount of explicit prototype surface in the library so the benchmark and normal application dispatch exercise the same implementation.

## Transparent-export follow-up

The prototype was subsequently extended to transparent exports. The original
"transparent-overlay exports" scope exclusion above records the initial
composite experiment; it no longer describes the implemented follow-up.

The shared frame-worker engine now uses output-frame tasks and caller-provided
progress mapping rather than importing the composite timeline. Transparent
normal dispatch remains segmented by default and can be switched explicitly
with `OVRLEY_TRANSPARENT_PARALLEL_MODE=frames:N`. The dedicated comparison
command is:

```powershell
pnpm benchmark:parallel-render-transparent -- <activity> <template> --codec <transparent-profile> --workers <N> --runs <count>
```

One 0-60 second, 3840x2160 comparison was run with `prores_ks_vulkan`, three
current segments, and three frame workers:

- Segments: **85.8587 s**, valid 1,800-frame-equivalent export.
- Frame workers: **83.5018 s**, valid 1,800-frame-equivalent export.
- Frame-worker wall-time change: **-2.75%**.
- Throughput speedup: **1.028x**.
- Both outputs probed as ProRes 4444 with `yuva444p12le` alpha pixel format and
  were approximately 2.15 GiB.

The paired report containing the segmented result is
`debug/benchmarks/parallel-render-transparent/1784414864.json`. The corrected
frame-worker report is
`debug/benchmarks/parallel-render-transparent/1784415105.json`.

The first frame-worker attempt queued all 1,800 frames but failed final drain
because the parallel producer dropped the free-buffer receiver before the
writer had returned its last queued buffers. Returning that receiver from the
worker engine and retaining it until writer join fixed the lifetime bug. The
2.75% single-run difference is inconclusive and should be repeated before
choosing a transparent production policy.

The Vulkan profile was then changed from CPU conversion followed by upload to
`hwupload,scale_vulkan=format=yuva444p10le:out_range=tv`, moving RGBA-to-YUVA
conversion to the SPIR-V backend. Repeating only the three-worker strategy took
**66.6170 s** (`debug/benchmarks/parallel-render-transparent/1784415891.json`),
which is **20.22% faster** than the prior 83.5018 s three-worker result. The
output again passed duration, codec, and alpha-format validation and probed as
ProRes 4444 `yuva444p12le`. The 85.8587 s segmented result used the old CPU
conversion graph, so it is no longer an apples-to-apples topology baseline;
segmentation must be rerun with the optimized profile before comparing segment
workers against frame workers.

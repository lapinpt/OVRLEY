# Parallel Frame Rendering Production Readiness

The prototype's core design is sound. Productionizing it is a medium backend hardening pass, not another renderer rewrite.

## Release blockers

### 1. Fix FFmpeg shutdown and cancellation ordering

The pipeline currently drops the frame sender and joins the writer before terminating FFmpeg. If `stdin.write_all()` is stuck because FFmpeg hangs, cancellation can also hang indefinitely.

Production behavior should be:

- On success: close stdin, drain the writer, and wait for FFmpeg.
- On cancellation or producer failure: signal workers, terminate FFmpeg immediately, then join the writer and monitor.
- Preserve the first meaningful error.
- Always remove partial output.
- Add a bounded shutdown timeout and force-kill fallback.
- Make queue sends observe local pipeline failure, not only user cancellation.

This is the largest correctness gap.

### 2. Replace floating-point frame accounting

The benchmark planned 1,754 progress frames, while every resulting video contained 1,753 frames. The source duration multiplied by its rational FPS evaluated to approximately `1753.00001`, and `ceil()` added a phantom frame.

Production should derive task count, segment windows, progress, and expected output count from one rational/integer timebase. There should be one canonical half-open frame interval, such as `[start_frame, end_frame)`, used by both strategies.

### 3. Introduce a production strategy policy

Remove `OVRLEY_COMPOSITE_PARALLEL_MODE` from normal dispatch and rename the prototype types and module.

The production policy should decide once, at ingress:

```text
codec/filter stack
resolution
physical/logical cores
per-frame memory
render duration
    -> Segments | FrameWorkers(N) | Serial
```

A conservative initial policy could use:

- `nnvgpu_h264`: frame workers, probably N=2 or N=3.
- CPU-overlay `nvgpu_h264`: frame workers N=2 or N=3.
- Unsupported or short jobs: the existing serial path.
- A developer-only explicit override for benchmarking.

Do not fall back to another strategy after a render has already failed. Select a supported strategy before starting.

### 4. Make worker and buffer limits resource-aware

At 4K, one RGBA buffer is about 31.6 MiB. The five-buffer Rust pool is roughly 158 MiB, while FFmpeg's 16-frame raw input queue can represent another approximately 506 MiB before GPU surfaces and decoded video are counted.

Production should:

- Use checked frame-byte calculations.
- Calculate queue and buffer counts from resolution and a memory ceiling.
- Require workers to obtain a render permit/buffer before claiming a frame. This is the invariant that fixed the prototype deadlock.
- Ensure `worker_count <= buffer_count - 1`.
- Reserve CPU capacity for FFmpeg rather than targeting 100% utilization.
- Use physical-core information where available instead of only logical parallelism.

A true MPMC free-buffer channel would simplify the implementation, but the current mutex-wrapped receiver is not itself a release blocker at N=2-3; profiling did not show it limiting throughput.

## Important hardening

### 6. Audit shared rendering assets

Keep Skia `Surface` and `Canvas` instances strictly worker-local, as they are now. Also:

- Document which prepared assets are immutable and thread-safe.
- Resolve or prewarm fonts, SVGs, and other lazy caches before workers start.
- Avoid first-use global cache initialization racing across workers.
- Remove hot-path mutexes only if timing shows contention.

### 7. Formalize worker failure handling

A worker panic, Skia error, FFmpeg exit, writer error, and user cancellation should all flow through one pipeline outcome model. Every path must:

- Stop new task allocation.
- Wake workers waiting for buffers.
- Stop ordered forwarding.
- Join all workers.
- Unblock or terminate the writer.
- Return the original error rather than teardown noise.

### 8. Bound diagnostic artifacts

Composite timing summaries currently accumulate indefinitely. Production diagnostics should be opt-in or have retention limits. Preserve the useful fields:

- Strategy and worker count.
- Render time excluding buffer waits.
- Buffer wait.
- Writer queue starvation.
- FFmpeg write backpressure.
- Reorder hold.
- Finalization time.

The metric named `encoder.queue_wait` should be renamed. It measures the Rust writer waiting for a rendered overlay, not NVENC's internal queue.

### 9. Clean up the prototype surface

Once the policy is settled:

- Rename `video_frame_parallel_prototype.rs` to `video_frame_parallel.rs`.
- Rename `PrototypeParallelMode` to its production policy type.
- Remove environment parsing from normal application execution.
- Make benchmark-only explicit entry points feature-gated or crate-internal.
- Keep the benchmark binary and JSON reports as developer tooling.
- Document the production invariants, especially buffer-before-task allocation.

## Outside the scope

These are worthwhile optimizations, but not readiness blockers:

- Rayon or Crossbeam.
- Direct Skia GPU rendering.
- CUDA-side RGBA-to-YUVA conversion.
- Pinned host memory.
- Adaptive worker count during an active export.
- Hybrid segmentation plus frame workers.
- Maximizing GPU utilization for its own sake.
- Frontend strategy controls.

## Minimum production path

The minimum production path is:

1. Harden shutdown.
2. Fix rational frame accounting.
3. Define a resource-aware strategy policy.
4. Remove the prototype-only dispatch surface.

After those changes, the existing worker/order/coordinator design is reasonable to build on.

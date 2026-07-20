---
name: rust-refactor
description: Refactor Rust code for clarity of ownership, responsibility, shutdown, and error propagation. Use when the user asks to refactor Rust code, simplify async or threaded pipelines, split long functions by concern, clean up concurrency primitives, tighten ownership boundaries, or consolidate shutdown and cancellation paths.
---

# Rust Refactor

Every refactor serves one goal: the structure must make **ownership**, **sharing**, **shutdown**, **error propagation**, worker **supervision**, and resource **cleanup** immediately clear.

## Responsibilities

Split functions by **responsibility**. A single function must not mix setup, execution, coordination, cancellation, error handling, cleanup, and profiling.

Separate these categories of state. Do not pass them through one struct:

- immutable configuration
- per-operation state
- shared concurrent state
- worker-only dependencies
- coordinator-only dependencies
- outputs

## Dependencies

Pass the smallest coherent dependency set. Do not pass large request or context objects into code that uses only a few fields.

Treat repeated groups of cloned, borrowed, or moved values as a sign of a missing abstraction.

Group values only when they share one **purpose**, **owner**, **lifecycle**, and **concurrency role**.

Do not replace many parameters with one oversized `Context` struct. Create narrow **role-specific** types instead.

## Loops

Extract spawned closure bodies into named worker functions.

**Worker loops**: obtain work, process it, report the result, stop when requested. Nothing else.

**Coordinator loops**: receive results, restore order, forward output, update progress, detect failures. Nothing else.

## Supervision

Give one component **sole responsibility** for: spawning workers, initiating shutdown, closing channels, joining threads, handling panics, recovering resources.

## Shutdown

Replace multiple stop and failure booleans with one **shutdown abstraction** that records whether execution should stop and why.

Define one clear **error propagation path**. Specify which component records the first failure, initiates shutdown, and returns the final error.

Preserve the **first meaningful error**. Treat later errors as secondary cleanup diagnostics unless they are more fundamental.

## Communication

Use **typed events** for communication between workers and coordinators. Do not represent the same event through unrelated channels and atomic flags.

Hide mutexes, atomics, channels, and memory ordering behind domain abstractions: **task sources**, **buffer pools**, **shutdown state**, **worker groups**.

Replace raw synchronization workarounds (`Arc<Mutex<Receiver<T>>>`) with an abstraction or primitive designed for the required access pattern.

Encapsulate **task distribution** instead of exposing atomic indexes throughout the implementation.

Encapsulate **pooled-resource** acquisition, return, shutdown, and ownership recovery.

## Ownership

Align **ownership** with the actual lifecycle. Avoid temporarily sharing uniquely owned resources and later relying on `Arc::try_unwrap` outside the owning abstraction.

Do not remove `Arc::clone` or sender clones merely to reduce clone count. Reduce them by **narrowing dependencies** and clarifying ownership boundaries.

Review repeated `SeqCst` usage only after the synchronization model is explicit and documented.

## Process

Refactor **incrementally** in this order:

1. Extract worker logic.
2. Extract coordinator logic.
3. Separate dependencies.
4. Unify shutdown.
5. Encapsulate resources.
6. Simplify synchronization.

## Invariants

After every change, these must hold:

- tasks execute at most once
- outputs are produced exactly once and in order
- cancellation stops all workers
- errors cannot deadlock the pipeline
- progress remains valid
- workers are always joined
- resources are recovered on every exit path

## Reject

Reject refactors that are ONLY cosmetic or surface-level: rename variables, move code into methods, extract unchanged closures, or wrap all dependencies in one large struct.

## Success

The refactor is successful only when ownership, sharing, shutdown, error propagation, worker supervision, and resource cleanup are immediately clear from the structure.

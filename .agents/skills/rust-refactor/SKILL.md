---
name: rust-refactor
description: Architecturally overhaul Rust code for explicit ownership, responsibility, supervision, shutdown, error propagation, and cleanup. Use for whole-function or whole-module clean-code refactors, especially async or threaded pipelines, tangled concurrency, broad contexts, unclear ownership boundaries, and fragmented cancellation paths.
---

# Rust Refactor

Perform a **deep refactor** of the entire requested scope. Treat the named file, module, function, or subsystem as the audit boundary, then include directly coupled callers, callees, and types when the target architecture requires their change.

The work is an architectural overhaul, not an issue hunt. Build a complete model of the current design before editing, replace the design coherently, and continue until every audit axis and every item in the boundary has an explicit disposition.

The target structure must make **ownership**, **sharing**, **responsibility**, **shutdown**, **error propagation**, worker **supervision**, and resource **cleanup** immediately clear.

## Workflow

### 1. Inventory the whole boundary

Read the entire requested scope and trace its directly coupled control flow and data flow. Inventory:

- every function, type, state field, channel, lock, atomic, worker, and owned resource
- setup, execution, coordination, cancellation, failure, joining, cleanup, and output paths
- the invariants and externally observable behavior that the refactor must preserve

Complete this step only when every item in the boundary is accounted for and every exit path has been traced through cleanup and error return.

### 2. Audit every architectural axis

Evaluate the complete boundary against every section below. For each axis, record either the structural change required or why the current structure is already sound:

- responsibilities
- dependencies and role-specific state
- worker and coordinator loops
- supervision
- shutdown and error propagation
- communication and synchronization
- ownership and resource lifecycle

Complete this step only when all axes have a disposition. One discovered defect is the beginning of the audit, not its result.

### 3. Design the replacement architecture

Define the target responsibilities, narrow types, ownership transfers, event flow, supervisor, shutdown authority, first-error path, join behavior, and resource recovery before editing. The design must resolve the audit as one coherent system rather than as isolated local fixes.

Complete this step only when each planned abstraction has one purpose, owner, lifecycle, and concurrency role, and every audited change maps to the target design.

### 4. Implement the overhaul end to end

Reshape the full boundary to match the target design. Make all required caller, callee, type, and test changes within scope. Keep the code compiling between coherent stages when practical, but treat intermediate compilation as a checkpoint rather than completion.

Complete this step only when every planned structural change is implemented and obsolete paths, fields, synchronization, and abstractions have been removed.

### 5. Re-audit and verify

Re-read the resulting boundary and repeat the architectural audit. Trace every invariant and exit path against the new structure. Run focused tests and the broadest relevant non-build test command allowed by the repository instructions.

Complete the refactor only when:

- every inventory item and audit axis has a final disposition
- no responsibility or lifecycle concern remains split across competing owners
- every obsolete path introduced by the old architecture is gone
- all invariants below hold on success, failure, cancellation, and panic paths
- relevant tests pass, or any pre-existing or environmental failure is identified precisely

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

## Invariants

After every change, these must hold:

- tasks execute at most once
- outputs are produced exactly once and in order
- cancellation stops all workers
- errors cannot deadlock the pipeline
- progress remains valid
- workers are always joined
- resources are recovered on every exit path

## Success

The refactor is successful only when the entire requested boundary has passed the final re-audit and the resulting architecture makes ownership, sharing, responsibility, shutdown, error propagation, worker supervision, and resource cleanup immediately clear. Renames, method moves, unchanged closure extraction, or a broad context wrapper count only when they serve that completed architecture; they never satisfy the skill by themselves.

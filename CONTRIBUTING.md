### 1. Establish the contract

Trace data from its authoritative boundary to its consumers. Identify:

- the canonical field names and types;
- which fields are genuinely optional;
- where validation, normalization, defaults, formatting, and derived state are owned;
- which layer owns business logic, presentation preparation, and rendering.

Do not infer optionality from defensive consumer code. Confirm it from schemas, types, tests, producers, and domain documentation. This step is complete when every fallback or guard in scope is classified as required-input repair, explicit optional behavior, or boundary validation.

### 2. Remove rescue paths

Consumers trust required data after it crosses its validation boundary. Replace repair and silent degradation with direct use of the canonical contract.

Remove required-input fallbacks, coercions, type probes, validity checks, generated identities, empty-result guards, and legacy-format branches. Typical debris includes `||`, `??`, optional chaining, default parameters, `Boolean`, `Number`, `parseInt`, `parseFloat`, `typeof`, `Array.isArray`, `Number.isFinite`, and `Number.isInteger`.

Keep a fallback only when absence is part of the documented contract. It may select explicit optional behavior; it must not make malformed present data look absent or valid.

```js
// Required: consume directly and fail loudly if the contract is broken.
const total = order.quantity * order.unit_price;

// Optional: absence has documented behavior.
const label = order.label ?? "Untitled";
```

This step is complete when required malformed input can no longer become a plausible value, empty output, or alternate identity inside a consumer.

### 3. Restore one language

Use canonical names and shapes end to end. Remove direct-field aliases and field-by-field adapters that translate a secondary vocabulary.

```js
// Secondary language at the call site.
calculateTotal({ unitPrice: order.unit_price, itemCount: order.quantity });

// One language across the boundary.
calculateTotal(order);
```

If a callee cannot consume the canonical model, correct its API and all affected callers. Keep locals for genuinely derived values or computed models, not shorter names for fields. Keep an adapter only at a real external-system boundary, where it translates once into the internal canonical model.

This step is complete when each concept has one internal name and translation occurs only at an identified external boundary.

### 4. Restore ownership

Components assemble and render presentation. Move stateful behavior and reusable presentation preparation into hooks; move pure computation, formatting, and transformation into utilities. Put validation and normalization at ingress, and put domain decisions in the domain layer that owns them.

Prefer APIs that accept the owning model over long positional arguments, nested preparation calls, callbacks used to avoid preparing a model, or remapped object literals. Independent hooks for independent subscriptions are legitimate; line-count reduction is not the goal.

This step is complete when components read as declarative presentation and each remaining calculation or branch belongs to the layer containing it.

### 5. Prune and flatten

Trace every changed or extracted export, helper, returned field, and import through production callers. Remove symbols and outputs with no production consumer. When a symbol is referenced only by tests, remove the production code and its tests; tests preserve observable behavior, not otherwise-unused implementation surfaces. Keep test-only production entry points only when the repository explicitly defines them as a supported testing boundary.

Make each abstraction eliminate duplication while keeping every function at module scope. Consolidate repeated transformations with top-level helpers, batch operations, data tables, or ordinary loops. Do not declare functions inside functions, including callbacks introduced only to shorten a local expression. Do not accept mirrored blocks that repeat the same operation when a flat, named abstraction can express it without hiding domain differences.

This step is complete when every remaining production symbol and returned field has a production consumer, tests exercise observable behavior, repeated operations have one flat abstraction, and every function declaration or expression is at module scope.

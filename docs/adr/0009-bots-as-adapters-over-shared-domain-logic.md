---
status: accepted
date: 2026-07-13
---

# Medplum Bots are thin adapters over shared domain logic

Medplum Bots are separately-deployed runtime units, while the deep-module interfaces
([`module-boundaries.md`](../architecture/module-boundaries.md)) live in application code. Domain
logic that a Bot must run - creating a Flag [`Task`](0002-flag-as-fhir-task.md), completing an
Assignment [`Task`](0001-assignment-as-fhir-task.md), emitting a Score `Observation`,
evaluating Triggers - is owned by the corresponding module and **exported as pure, side-effect-free
functions in a shared package**. The Bot is a **thin adapter**: it unpacks the FHIR event, calls the
shared function(s), and persists the returned resources. It does **not** hand-roll resource shapes.

## Why

- Without this rule, a Bot would duplicate resource-construction logic (Task `code`, `businessStatus`
  mapping per [ADR-0003](0003-task-modeling-conventions.md), LOINC coding), which drifts from the
  module and silently violates the "only module X writes resource Y" boundary asserted in
  [ADR-0002](0002-flag-as-fhir-task.md) and [ADR-0001](0001-assignment-as-fhir-task.md).
- Pure functions (answers + config -> resources to create) are the same seam the unit tests already
  target ([`testing-strategy.md`](../architecture/testing-strategy.md)), so the Bot and the tests
  exercise identical logic.
- It keeps deep modules (P6) intact in a Bot-based runtime: the module owns the *what*; the Bot owns
  only the *when/where* (event wiring + persistence).

## Clarification of the boundary rule

"Only the Flag/Assignment module writes its `Task`" means **only that module's logic constructs the
resource - including when that logic is invoked from inside a Bot.** A Bot invoking the module's
exported function is compliant; a Bot building a `Task` inline is not.

## Consequences

- A shared package (pure domain functions) is importable by both the app services and the Bots; Bots
  contain no business rules of their own.
- The Scoring Bot ([ADR-0004](0004-scoring-and-trigger-engine.md)) composes: `Instrument` config
  load + scoring + Trigger evaluation + Flag construction, all via shared functions; it persists the
  results and marks the Assignment complete via the Assignment module's function.
- Bot idempotency (conditional creates) remains the Bot's concern - it is a persistence/runtime
  detail, not domain logic.

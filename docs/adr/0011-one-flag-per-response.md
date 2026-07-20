---
status: accepted
date: 2026-07-20
---

# One Flag per Response, carrying every Trigger's reason

When several [Triggers](../../CONTEXT.md) fire on a single [Response](../../CONTEXT.md), the
[Scoring engine](0004-scoring-and-trigger-engine.md) raises **one** [Flag](../../CONTEXT.md) for
that Response - carrying **all** the fired Triggers' reasons, ranked at its **highest-priority
tier** - not one independent Flag per Trigger. A Flag's identity is the **Response** (the
assessment that needs attention), not the (Response, Trigger) pair.

This settles the design left open by ticket #47 and **revises the "a Flag per fired Trigger"
wording** of [ADR-0002](0002-flag-as-fhir-task.md) and [ADR-0004](0004-scoring-and-trigger-engine.md):
those ADRs' persistence and seam decisions stand; only their assumption that each fired Trigger
yields its own Flag is superseded here.

## Context

The tracer bullet raised one Flag `Task` per fired Trigger (`domain/scoring.ts` mapped
`triggers.filter(fires)` to one `RaisedFlag` each). In practice a PHQ-9 with total >= 10 **and**
Item 9 >= 1 trips both the severity-band and acute-risk Triggers, so the coordinator Worklist
received **two independent items for the same patient, same assessment, same instant** - two
claims, two resolutions, two chances to leave one open or record inconsistent dispositions for a
single clinical event. Surfaced by the product review (Scenario 2).

## Decision and why

`CONTEXT.md` already defines a Flag as *"a patient who needs the Care Coordinator's attention."*
The unit of attention is the **patient's assessment**, not the trigger condition. Every Trigger
in the domain today means the same thing operationally - *this PROM needs a coordinator to look* -
so multiple fired Triggers are **facets of one clinical event**, handled in one coordinator
contact. Modelling them as one Flag with multiple reasons matches the ubiquitous language; one
Flag per Trigger does not.

The model was already built for this - only the kernel's fan-out had to change:

- `Flag.triggerCodes` / `RaisedFlag.triggerCodes` are already `string[]` (plural).
- The idempotency key `flagDedupKey(responseId, triggerCodes)` already sorts and joins **all**
  codes into one key, so grouping stays idempotent under at-least-once redelivery (ADR-0004).
- The Flag `Task` codec already maps `triggerCodes[]` to `Task.reasonCode.coding[]` and back
  (FR-22 audit - *which* Triggers fired - is preserved).
- `PriorityPolicy` ranks by a single tier, so a grouped Flag simply takes `priority = max tier`
  (acute-risk wins), keeping FR-24/25 ordering intact.

So the change is confined to the pure kernel (group the fired Triggers into one `RaisedFlag`) and
the Flag-detail rendering (show every reason). The Scoring service, Worklist, dedup key, and
priority policy are unchanged.

## Considered and rejected

- **One Flag per Trigger (status quo).** Correct only if two Triggers on one Response were
  genuinely independent tasks for potentially different owners with different dispositions. No
  such Trigger exists in the domain; keeping it imposes duplicate work and split-resolution risk
  on every multi-trigger assessment.
- **Keep N Tasks, grouped/linked, resolve-as-set.** Preserves per-Trigger lifecycle we do not
  want ("resolve once" contradicts it) at the cost of a grouping construct plus a resolve-as-set
  transaction with partial-failure semantics - strictly more complex than one Task for the same
  clinical outcome.
- **Keep N independent Tasks, cascade-resolve.** Still shows N Worklist rows until resolution and
  muddies the audit ("why did this acute-risk Flag resolve? - a sibling did").

## Consequences

- A Response yields **at most one** Flag. Resolving it clears the whole assessment from the
  Worklist with a single Resolution reason (FR-27/28), retained against every reason for audit
  (NFR-6).
- The single-trigger case is unchanged (one Trigger -> one Flag with one reason), so there is no
  regression for the common path.
- **Revisit if** a future Trigger denotes a genuinely independent workflow (e.g. a
  non-PROM-attention task) that a *different* coordinator should own and resolve separately from
  the assessment. That would reintroduce a (Response, Trigger)-grained Flag for that Trigger class
  and should be recorded as its own decision.
- `CONTEXT.md` (Flag, Trigger) and requirements FR-21/FR-34 are updated to state the one-Flag-per-
  Response model. Implementation is ticket #47.

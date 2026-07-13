---
status: accepted
date: 2026-07-13
---

# Model the Assignment as a FHIR `Task` in v1

An [Assignment](../../CONTEXT.md) - a Care Coordinator giving a specific Instrument to a
specific patient to complete - is persisted as a FHIR **`Task`**, not a `ServiceRequest`. The
`Task` carries `focus` -> the `Questionnaire` (the Instrument), `for` -> the `Patient`, a status
mapped to the Assignment lifecycle (Pending -> Completed -> Expired), and
`restriction.period.end` for the 14-day deadline (FR-7). The [Access link](../../CONTEXT.md) is a
delivery mechanism that lives *outside* this resource; the `Task` is the durable Assignment.

The domain model stays independent of this choice: the rest of the application works with the
**Assignment** domain concept, and a single Assignment module (the infrastructure seam) maps it to
and from `Task`. No other module reads or writes `Task` for Assignments directly. This keeps the
resource decision reversible behind an interface.

## Why `Task`

- It is Medplum's documented, idiomatic pattern for "have this patient complete this questionnaire"
  (Medplum states a `Task` "might represent the task of having a practitioner complete a PHQ-9
  questionnaire for a patient"). See [research](../research/medplum-prom-architecture.md) §4.
- It natively supplies every field the Assignment needs (`focus`, `for`, `status`,
  `restriction.period`, `businessStatus`) without custom extensions.
- It reuses Medplum's worklist/queue tooling and search, and it distinguishes cleanly from the
  Worklist Flag `Task` (a separate decision) via `Task.code`.

## Why not `ServiceRequest` (rejected for v1)

FHIR's workflow taxonomy would model a pure request/authorization as a `ServiceRequest` that a
`Task` then fulfils (`ServiceRequest` -> `Task`, linked by `Task.basedOn`). We rejected this now:

- Validated product scope is **one-off** assignments only - no recurring assessments, care plans,
  or scheduled orchestration that a `ServiceRequest` authorization layer would justify.
- Introducing it now is premature abstraction and violates the tracer-bullet philosophy (P9): the
  Assignment is already the single actionable unit.

## Future conditions that would justify migrating to `ServiceRequest` -> `Task`

Revisit this decision if any of these enter scope:

- **Recurring or scheduled assessments** (e.g. "PHQ-9 every 2 weeks") that need one standing
  authorization spawning many completion Tasks.
- **Care-plan / protocol orchestration** where an Instrument order must be authorized independently
  of, and outlive, an individual completion attempt.
- **Multiple Responses per order** (re-issue on expiry as the same clinical order rather than a new
  Assignment).

Because the Assignment module hides the resource behind the domain concept, such a migration is
contained at that seam rather than rippling through the app.

## Consequences

- The Access-link token store and single-use/expiry enforcement are modelled separately (a later
  decision); they are not fields on this `Task`.
- The Assignment `Task` and the Worklist Flag `Task` are two different Task types, disambiguated by
  `Task.code` (subject of a following decision).

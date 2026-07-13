---
status: accepted
date: 2026-07-13
---

# `Task` modeling conventions: discriminator and lifecycle

Both the [Assignment](0001-assignment-as-fhir-task.md) and the [Flag](0002-flag-as-fhir-task.md)
are persisted as FHIR `Task`. This ADR fixes the conventions that keep the two coherent and
domain-faithful.

## Discriminator - `Task.code` with a project-owned `CodeSystem`

The two `Task` types are distinguished by `Task.code`, drawn from a **project-owned `CodeSystem`**
(a URL we control, e.g. `https://<project>/fhir/CodeSystem/task-code`), not bare strings and not
inferred from resource shape. Initial codes:

- `assignment` - a coordinator's request for a patient to complete an Instrument (ADR-0001).
- `flag` - a Worklist work item raised by a Trigger (ADR-0002).

This makes the type explicit, queryable, and validatable. The Worklist query becomes a simple
coded search (`Task?code=<system>|flag&status:not=completed`). Inferring the type from shape (e.g.
"has `focus` -> Questionnaire") was rejected as fragile.

## Flag lifecycle - `businessStatus` carries the domain lifecycle; `status` shadows it

The Flag lifecycle **Open -> Acknowledged -> Resolved** is represented in **`Task.businessStatus`**,
using values from a **project-owned `CodeSystem`** (e.g.
`https://<project>/fhir/CodeSystem/flag-status`), with `Open`/`Acknowledged`/`Resolved` as codes -
not free-form strings. `Task.status` is kept coherent with the standard FHIR workflow value set
underneath (`ready` -> `in-progress` -> `completed`) so Medplum's built-in tooling keeps working.

The mapping is one-directional (domain lifecycle drives both fields):

| Domain (businessStatus) | FHIR `Task.status` |
| ----------------------- | ------------------ |
| Open                    | `ready`            |
| Acknowledged            | `in-progress`      |
| Resolved                | `completed`        |

### Why (trade-off)

- Our lifecycle is domain-specific: e.g. "Resolved" always carries a Resolution reason (FR-28),
  which is more than FHIR `completed`. The Worklist is the product's operational heart and should
  speak the domain's exact language.
- Coding `businessStatus` in a project-owned `CodeSystem` (rather than free text) keeps it
  explicit, type-safe, and extensible without sacrificing interoperability with Medplum/FHIR.
- Rejected alternative: mapping the lifecycle onto `Task.status` alone. Simpler, but it loses the
  exact domain words and leaves no room for states outside the fixed FHIR value set.

## Consequences

- Two small project-owned `CodeSystem`s are introduced (task type, flag status). They are
  configuration/reference data the app owns.
- The Assignment lifecycle (Pending/Completed/Expired, ADR-0001) will follow the same pattern when
  it is specified (its own `businessStatus` codes shadowing `status`); detailed in the data model.
- Still open (separate decisions): the Resolution-reason value set (FR-28), and the first-claim-wins
  Acknowledge concurrency mechanism (FR-26).

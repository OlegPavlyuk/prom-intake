---
status: accepted
date: 2026-07-13
---

# Persist the domain Flag as a FHIR `Task`, not a FHIR `Flag`

The domain [Flag](../../CONTEXT.md) - a work item raised when a Trigger fires on a Response,
worked through **Open -> Acknowledged -> Resolved**, with a single owner, a structured Resolution
reason + optional note, and a priority - is persisted as a FHIR **`Task`**. It is **not** persisted
as a FHIR `Flag` resource, despite the name.

As with [ADR-0001](0001-assignment-as-fhir-task.md), the domain language stays technology-agnostic:
the application works with the **Flag** concept and the Worklist/Flag module maps it to and from
`Task`. **Only the Flag module's logic constructs a Flag `Task`** - including when that logic runs
inside a Bot, which invokes the module's exported function rather than building a `Task` inline (see
[ADR-0009](0009-bots-as-adapters-over-shared-domain-logic.md)). This is a deliberate DDD separation -
the ubiquitous language ("Flag") is not bent to the persistence technology.

## Why not the FHIR `Flag` resource

FHIR `Flag` is a display-oriented warning banner, deliberately narrow. It cannot express what our
Flag needs:

| Domain need (FR) | FHIR `Flag` | FHIR `Task` |
| ---------------- | ----------- | ----------- |
| Lifecycle Open -> Acknowledged -> Resolved | only `active | inactive | entered-in-error` | `status` + `businessStatus` |
| Single owner, claim on Acknowledge (FR-26) | only `author` (creator) | `owner` |
| Priority ordering (FR-24/25) | none | `priority` |
| Resolution reason + note (FR-28) | none | `businessStatus`/`output` + `note` |
| Which Trigger fired (FR-22) | none | `focus` / `reasonCode` / `input` |

Forcing our lifecycle onto `Flag` would mean heavy custom extensions to reinvent what `Task`
already provides. `Task` is Medplum's documented worklist/queue primitive. See
[research](../research/medplum-prom-architecture.md) §3.

## Why the naming collision is acceptable

There will be a `Task` that our language calls a "Flag", while an unused FHIR resource is literally
named `Flag`. This is accepted because the domain model is independent of the FHIR layer: engineers
read "Flag" in the domain/UI/code seams, and only the Worklist module knows the persisted resource
is a `Task`. The collision is contained at one seam and documented here so no future contributor
"corrects" it by switching to FHIR `Flag`.

## Consequences / follow-on decisions (not yet settled)

- **Lifecycle representation.** Whether Open/Acknowledged/Resolved map onto `Task.status`,
  `Task.businessStatus`, or a combination is a separate decision. `businessStatus` is free-form and
  non-interoperable; acceptable for single-org v1 but to be decided explicitly.
- **Discriminator.** The Assignment `Task` (ADR-0001) and the Flag `Task` are distinguished by
  `Task.code`. The exact code system/values, and how much rests on that single field, are a
  separate decision.
- **Concurrency.** First-claim-wins Acknowledge (FR-26) has no Medplum-documented recipe; the
  mechanism (e.g. ETag / conditional update) is a separate decision.

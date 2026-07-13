---
status: accepted
date: 2026-07-13
---

# Single-owner Acknowledge via optimistic concurrency (ETag / `If-Match`)

FR-26 requires that when two Care Coordinators Acknowledge the same Open [Flag](0002-flag-as-fhir-task.md)
concurrently, exactly one becomes the owner and the other is told it is already claimed; a Flag has
at most one owner. Medplum documents no first-claim-wins recipe, so we fix the mechanism here.

## Decision

Use **optimistic concurrency via conditional update**. The Acknowledge operation reads the Flag
`Task` (obtaining its `meta.versionId` / ETag) and writes the `owner` back with `If-Match: <that
version>`. The first write wins; a losing write is rejected by the server with `412 Precondition
Failed`. The owner assignment and the version check are one atomic server operation - no locks, no
extra infrastructure, no polling.

This is the idiomatic Medplum/FHIR mechanism (the same versioning the server already uses to guard
concurrent writes). Rejected alternatives: search-based conditional update on an "owner missing"
guard (more finicky to express in FHIR) and pessimistic locking (extra infrastructure, not
idiomatic).

## Encapsulation - the seam returns a domain outcome, not an HTTP code

The concurrency logic is fully encapsulated inside the **Worklist/Flag service**. Callers and the
UI never see `412`; the service translates a lost race into a domain-level outcome
(`FlagAlreadyClaimed`, carrying the current owner when available). This keeps the domain clean and
lets the underlying mechanism change without touching callers.

## v1 UX (loser)

Show "already claimed by <name>", refresh the Worklist, and let the coordinator take the next item
(B1). Offering a read-only view of a claimed Flag (B2) is deferred to feature-spec time; it does not
affect this architecture.

## Consequences

- The same optimistic-concurrency pattern is the natural default for other single-writer
  transitions on a Flag (e.g. Resolve); to be applied consistently by the Worklist service.

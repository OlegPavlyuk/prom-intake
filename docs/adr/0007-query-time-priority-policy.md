---
status: accepted
date: 2026-07-13
---

# Worklist priority is a query-time `PriorityPolicy`, not a stored rank

The [Worklist](../../CONTEXT.md) ordering (FR-24/25: acute-risk first, then severity, then oldest
Open within a tier; a single priority function, no rules engine) is computed **at query time** by a
dedicated domain component, not persisted as a rank on the Flag.

## Decision

- **Query-time.** When the Worklist is built, the **unresolved** [Flag](0002-flag-as-fhir-task.md)
  `Task`s - both **Open and Acknowledged** (FR-23/25/26) - are loaded and ordered by the priority
  logic on read. No priority value is stored; the function is the single source of truth. Ordering
  ranks across state: an Acknowledged acute-risk Flag still outranks a lower-priority Open Flag
  (FR-25), and within a tier Acknowledged Flags rank below Open ones (FR-26).
- **Dedicated component (`PriorityPolicy`).** All ordering rules live in a `PriorityPolicy` (a.k.a.
  PriorityService) - a single deterministic domain component. The **Worklist service orchestrates**
  (load, return); the **`PriorityPolicy` owns ordering** (SRP). This is the FR-24 "single priority
  function" made concrete and independently unit-testable through its seam (feed Flags, assert
  order).

## Why not stored priority

Storing a computed rank on write would split the logic between a writer and a `_sort`, and "oldest
Open within a tier" is relative and time-dependent - a stored rank would need recomputation as Flags
come and go. Query-time is always correct with zero maintenance. All v1 priority inputs (which
Trigger fired, Score band, `authoredOn`) are cheaply available at read, and at single-org
coordinator scale the candidate set is small, so read-time sorting is not a performance concern.

## Trade-off / escape hatch

Stored/projected priority + DB-side sort only pays off at large scale (huge Worklists, DB-side
pagination) or when priority depends on expensive external data - none of which apply to v1 and all
of which are out of scope. Because ordering is encapsulated behind the `PriorityPolicy` interface,
moving to a stored rank later is a localized change that callers never see.

## Consequences

- Pagination sorts the full candidate set before slicing; fine at coordinator scale, noted as the
  trigger to reconsider stored priority if the Worklist ever grows large.
- New prioritization factors are added inside `PriorityPolicy` only.

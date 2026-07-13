# Architecture Decision Records (ADRs)

Each ADR captures one decision that was **hard to reverse, surprising, or the result of a real
trade-off**. Routine choices do not get an ADR - keep the noise low so the signal stays high.

- **Who writes them:** the `/domain-modeling` skill (reached via `/grill-with-docs` and
  `/improve-codebase-architecture`) proposes an ADR only when a decision meets the bar above.
- **Numbering:** zero-padded, monotonic - `0001-...md`, `0002-...md`.
- **Format:** see `.agents/skills/domain-modeling/ADR-FORMAT.md`.
- **Status values:** `Proposed` -> `Accepted` -> (later) `Superseded by ADR-XXXX` / `Deprecated`.

When new code would contradict an existing ADR, surface the conflict explicitly (see
`docs/agents/domain.md`) rather than silently overriding it.

## Records

- [ADR-0001](0001-assignment-as-fhir-task.md) - Model the Assignment as a FHIR `Task` in v1 (`accepted`).
- [ADR-0002](0002-flag-as-fhir-task.md) - Persist the domain Flag as a FHIR `Task`, not a FHIR `Flag` (`accepted`).
- [ADR-0003](0003-task-modeling-conventions.md) - `Task` modeling conventions: discriminator and lifecycle (`accepted`).
- [ADR-0004](0004-scoring-and-trigger-engine.md) - Scoring and Trigger evaluation run in one instrument-agnostic Bot (`accepted`).
- [ADR-0005](0005-access-link-security-model.md) - Account-less Access link: token model and security envelope (`accepted`).
- [ADR-0006](0006-acknowledge-concurrency.md) - Single-owner Acknowledge via optimistic concurrency (ETag / `If-Match`) (`accepted`).
- [ADR-0007](0007-query-time-priority-policy.md) - Worklist priority is a query-time `PriorityPolicy`, not a stored rank (`accepted`).
- [ADR-0008](0008-integration-tests-against-real-medplum.md) - Integration tests run against a real Medplum, not a mocked FHIR server (`accepted`).
- [ADR-0009](0009-bots-as-adapters-over-shared-domain-logic.md) - Medplum Bots are thin adapters over shared domain logic (`accepted`).

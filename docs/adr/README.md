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

_No ADRs recorded yet._

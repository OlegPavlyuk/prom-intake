# Iteration 2 (post-tracer-bullet) - Ticket Breakdown (mirror)

> **Canonical copy:** the GitHub issues linked below. This file is an in-repo mirror/index of
> [Spec #45](https://github.com/OlegPavlyuk/medpulm-project/issues/45). Do not treat it as the
> source of truth for status - GitHub is.

The first iteration after the v1 PHQ-9 tracer bullet (Spec #1, tickets #13-#23). It captures three
product & architecture-review findings from exercising the running system. Each is a vertical
slice sized for one fresh session; none changes the v1 architecture. Planned capabilities are
recorded in [`requirements.md`](../product/requirements.md) (FR-33/34/35) and
[`roadmap.md`](../product/roadmap.md) (*Next*).

## Tickets

| # | Issue | Ticket | FR | Cx | Triage | Model |
| - | ----- | ------ | -- | -- | ------ | ----- |
| T12 | [#46](https://github.com/OlegPavlyuk/medpulm-project/issues/46) | Assessment history: coordinator patient timeline of Responses & Scores | FR-33 | M | ready-for-agent | Sonnet |
| T13 | [#47](https://github.com/OlegPavlyuk/medpulm-project/issues/47) | One Flag per Response (multi-reason): settle design + implement | FR-34 | M-L | ready-for-human | Opus |
| T14 | [#48](https://github.com/OlegPavlyuk/medpulm-project/issues/48) | Search-first patient selection on assign | FR-35 | S | ready-for-agent | Sonnet |

Full acceptance criteria + Definition of Done live in each issue body.

## Independence & suggested order

The three tickets are **independent** - no blocking edges between them, and the tracer bullet
(#13-#23) they build on is merged. Recommended order by clinical value / effort:

1. **#47** (T13) - highest clinical value, cheapest fix; carries an open design decision, so it is
   `ready-for-human` until its design pass lands an ADR, after which implementation is a
   straightforward slice.
2. **#48** (T14) - protects the future longitudinal record by curbing duplicate patients; a
   contained UI change.
3. **#46** (T12) - turns the already-persisted (FR-32) Responses/Scores into a coordinator-visible
   timeline; the first read-only slice of longitudinal tracking.

## Explicitly deferred

Full patient identity management (duplicate merge, MRN/DOB matching, patient administration) stays
out of this iteration; see the *Later* roadmap item and the requirements Deferred findings.

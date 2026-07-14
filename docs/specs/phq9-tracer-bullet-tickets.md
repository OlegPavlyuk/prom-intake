# PHQ-9 Tracer Bullet - Ticket Breakdown (mirror)

> **Canonical copy:** the GitHub issues linked below (label `ready-for-agent`, native `blocked_by`
> dependency links). This file is an in-repo mirror/index of the `/to-tickets` output for
> [spec #1](https://github.com/OlegPavlyuk/medpulm-project/issues/1). Do not treat it as the source of
> truth for status - GitHub is.

The tracer bullet (assign -> open link -> submit -> score -> flag -> worklist -> acknowledge ->
resolve) is cut into **11 vertical-slice tickets**. Each is sized for **one fresh Claude Code
session**. See [`../workflows/IMPLEMENTATION_GUIDE.md`](../workflows/IMPLEMENTATION_GUIDE.md) for how to
run an implementation session.

## Tickets

| # | Issue | Ticket | Cx | Session scope | Model |
| - | ----- | ------ | -- | ------------- | ----- |
| T1 | [#13](https://github.com/OlegPavlyuk/medpulm-project/issues/13) | Foundation & real-Medplum test harness (first-code milestone) | L | Likely one full session | Opus |
| T2 | [#14](https://github.com/OlegPavlyuk/medpulm-project/issues/14) | Instrument domain: PHQ-9 defined & loadable | M | Comfortably one session | Prefer Opus |
| T3 | [#15](https://github.com/OlegPavlyuk/medpulm-project/issues/15) | Assign PHQ-9 & deliver an Access link | L | Likely one full session | Opus |
| T4 | [#16](https://github.com/OlegPavlyuk/medpulm-project/issues/16) | Patient completion (client-side): open, gate, Crisis Response | M | Comfortably one session | Sonnet |
| T5 | [#17](https://github.com/OlegPavlyuk/medpulm-project/issues/17) | Submit via publicWebhook Bot (atomic consume) | L | Likely one full session | Opus |
| T6 | [#18](https://github.com/OlegPavlyuk/medpulm-project/issues/18) | Scoring & Trigger engine (pure) | M | Comfortably one session | Prefer Opus |
| T7 | [#19](https://github.com/OlegPavlyuk/medpulm-project/issues/19) | Scoring Bot wiring: persist Score & Flags | M | Comfortably one session | Prefer Opus |
| T8 | [#20](https://github.com/OlegPavlyuk/medpulm-project/issues/20) | PriorityPolicy (pure): order Flags | S | Comfortably one session | Sonnet |
| T9 | [#21](https://github.com/OlegPavlyuk/medpulm-project/issues/21) | Worklist: list prioritized Flags + Flag detail | M | Comfortably one session | Sonnet |
| T10 | [#22](https://github.com/OlegPavlyuk/medpulm-project/issues/22) | Acknowledge a Flag (single-owner claim) | M | Comfortably one session | Opus |
| T11 | [#23](https://github.com/OlegPavlyuk/medpulm-project/issues/23) | Resolve a Flag + E2E tracer bullet | M | Likely one full session | Either |

Full acceptance criteria + Definition of Done live in each issue body.

## Dependency graph (DAG)

```
#13 ─▶ #14 ─┬─▶ #15 ─▶ #16 ─▶ #17 ─┐
            │                       ├─▶ #19 ─┐
            ├─▶ #18 ────────────────┘         ├─▶ #21 ─▶ #22 ─▶ #23
            └─▶ #20 ──────────────────────────┘
```

- **UI / submit chain:** #14 → #15 → #16 → #17
- **Pure-domain chain (may start right after #14):** #14 → #18, #14 → #20
- **Convergence:** #17 + #18 → #19 (scoring Bot); #19 + #20 → #21 (Worklist)
- **Worklist tail:** #21 → #22 → #23

Native `blocked_by` links enforce the gate on GitHub; a ticket is workable once every blocker is
closed. #13 is the current frontier.

## Suggested sequential order

`#13, #14, #15, #16, #17, #18, #19, #20, #21, #22, #23` (the pure kernels #18/#20 may be pulled forward
to right after #14 if preferred).

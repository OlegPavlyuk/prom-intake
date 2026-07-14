# Implementation Guide (per-ticket sessions)

> How to run the **implementation phase** of the PHQ-9 tracer bullet: one `ready-for-agent` ticket per
> **fresh Claude Code session**, start to finish, without redoing settled architecture. This guide is
> the operational companion to the [Operating Manual](OPERATING_MANUAL.md) §7 and the ticket index at
> [`../specs/phq9-tracer-bullet-tickets.md`](../specs/phq9-tracer-bullet-tickets.md).

The golden rule (P5): **one ticket per fresh session, fresh session per ticket.** Never work two
tickets in one thread. Everything a session needs comes from the **issue** and the **repo** - never
from a prior chat.

---

## 1. How each session begins (context to load, in order)

Start a clean session and read, before touching code:

1. **The ticket** - `gh issue view <NN> --comments`. This is the brief: what to build, acceptance
   criteria, Definition of Done, seam(s), architecture guardrails, and blocked-by.
2. **Confirm it is workable** - `gh api repos/OlegPavlyuk/medpulm-project/issues/<NN> --jq
   .issue_dependencies_summary` must show `blocked_by: 0` (every blocker closed). If not, stop and pick
   a frontier ticket.
3. **This repo's rules** - [`CLAUDE.md`](../../CLAUDE.md) and [Operating Manual](OPERATING_MANUAL.md).
4. **The domain glossary** - [`CONTEXT.md`](../../CONTEXT.md). Use its exact terms in code, tests, and
   commits; do not invent synonyms.
5. **The spec** - [issue #1](https://github.com/OlegPavlyuk/medpulm-project/issues/1) (the living
   contract) and its mirror [`../specs/phq9-tracer-bullet.md`](../specs/phq9-tracer-bullet.md).
6. **The architecture in the ticket's area** - the ADRs and `docs/architecture/*` named in the ticket's
   "Architecture guardrails" (at minimum `overview.md`, `module-boundaries.md`, `testing-strategy.md`,
   and the relevant `docs/adr/*`).
7. **The code as it stands** - what previous tickets already built (modules, seams, test harness).

Then **claim** the ticket: `gh issue edit <NN> --add-assignee @me` (the session's first write), and
create the branch: `<type>/<NN>-<slug>` (e.g. `feat/14-instrument-domain`).

---

## 2. Reusable prompt to start a ticket

```
Work GitHub issue #<NN> in this repo as a single fresh implementation session.

Before any code, read in this order: the issue (`gh issue view <NN> --comments`), CLAUDE.md,
docs/workflows/OPERATING_MANUAL.md, CONTEXT.md, spec issue #1 (docs/specs/phq9-tracer-bullet.md),
and the ADRs + docs/architecture files named in the issue's "Architecture guardrails". Confirm the
issue's blocked_by is 0 before starting.

Then implement it with TDD at the seam named in the ticket:
- Claim the issue and create branch <type>/<NN>-<slug>.
- Write the failing test(s) at the agreed seam first (RED), then the minimal code to pass (GREEN),
  then refactor. Test through the module interface, not internals; assert domain outcomes, not FHIR
  shapes or HTTP codes. Integration points run against the real Medplum test project (ADR-0008), not
  a mock.
- Continuously respect: the ADRs (no silent deviation - surface conflicts as an ADR update), module
  boundaries + dependency rules, and the CONTEXT.md vocabulary.
- Do not build beyond this ticket's scope.

Finish only when every item in the ticket's Definition of Done is satisfied: acceptance criteria
implemented, full suite green (unit + integration where applicable), lint + typecheck +
lint:boundaries green, docs updated in the same change, and a commit + PR ("Closes #<NN>") opened.
Report progress and any decisions on the issue/PR, not in chat.

Recommended model for this ticket: <from the ticket metadata>.
```

Fill `<NN>`, `<slug>`, `<type>` (`feat`/`fix`/`chore`/`refactor`/`docs`), and the model.

---

## 3. What to continuously verify during implementation

Keep these true at every step, not just at the end:

- **Spec compliance** - the behavior matches issue #1 + this ticket's acceptance criteria; nothing
  more, nothing less.
- **ADR compliance** - no deviation from ADR-0001..0009. Assignment/Flag persist as `Task`; only the
  owning module constructs its resource (incl. inside Bots, per ADR-0009); Bots are thin adapters over
  shared pure functions; `If-Match` for single-owner claims; query-time `PriorityPolicy`. If a detail
  seems to require changing a decision, **surface it as an ADR update - do not silently deviate.**
- **Module boundaries** - callers speak the domain interface; no module reads another's FHIR resources
  directly; `lint:boundaries` stays green.
- **Testing strategy** - test at the highest seam that isolates the behavior; pure logic off-server;
  Medplum integration points against real Medplum; assert domain outcomes (e.g. `FlagAlreadyClaimed`),
  never HTTP codes or private FHIR shapes.
- **Vocabulary** - `CONTEXT.md` terms exactly, in identifiers, tests, and messages.
- **Definition of Done** - keep the ticket's DoD checklist in view; it is the exit contract.

---

## 4. Exit criteria - when a ticket is complete

End the session only when **all** hold (this is the DoD, made concrete):

- [ ] Every acceptance criterion in the issue is implemented.
- [ ] The ticket's Definition of Done is satisfied (behavior, tests, demo/verify, artifacts).
- [ ] Full test suite green - unit **and** integration (against real Medplum) where the ticket applies.
- [ ] `lint`, `typecheck`, and `lint:boundaries` green.
- [ ] `/code-review` (Standards + Spec axes) clean, or findings consciously accepted.
- [ ] `/verify` confirms the behavior in the running app (for user-facing tickets).
- [ ] Docs updated **in the same change**: `CONTEXT.md` / ADR / `docs/architecture/*` / `features.md` as
      applicable (never a deferred docs pass).
- [ ] Commit(s) made (imperative subject, references `#NN`, **no AI co-author line**, no em dash) and a
      PR opened with "Closes #NN" + the acceptance checklist.
- [ ] Progress/decisions recorded on the issue/PR.

Then a **human** reviews + merges (green CI). The branch closes exactly one ticket.

---

## 5. Transition to the next session

- **Commit and push everything that belongs to the ticket** - code, tests, and the docs updates - on
  the ticket branch, and open the PR. Nothing that belongs to the ticket should be left uncommitted.
- **Leave nothing uncommitted** between sessions. The next session starts cold; uncommitted working
  state is invisible to it and will be lost.
- **No handoff doc is needed for the normal case.** Each ticket is self-contained; the durable record
  is the merged code + the issue/PR. Only use `/handoff` if a **single** ticket genuinely cannot finish
  in one session - it writes a compact pointer doc (reference artifacts by path/URL, never paste
  diffs/secrets) so a fresh session resumes that one ticket.
- **Do not re-derive architecture.** Settled decisions live in the ADRs, `docs/architecture/*`,
  `CONTEXT.md`, and the spec. A new session reads them; it does not re-open them. If a decision needs to
  change, that is an ADR update in its own right, not an implementation-session side effect.
- **Pick the next frontier ticket** - any open `ready-for-agent` issue with `blocked_by: 0` and no
  assignee, in dependency order (start at #13). Open a **fresh session** and return to §1.

---

_This guide is process, not product. If the workflow itself changes, update this file in the same PR
that changes the workflow._

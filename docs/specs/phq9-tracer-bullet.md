# Spec: PHQ-9 tracer bullet - assign -> complete -> score -> flag -> worklist -> resolve

> **Canonical copy:** [GitHub issue #1](https://github.com/OlegPavlyuk/medpulm-project/issues/1)
> (label `ready-for-agent`). This file is a local mirror.
> Terms are defined in [`CONTEXT.md`](../../CONTEXT.md). Architecture is settled in
> [`docs/architecture/`](../architecture/) and [`docs/adr/`](../adr/) (ADR-0001..0009, all accepted);
> this spec is synthesis of those decisions, not a re-design. Requirements it satisfies are
> FR-1..FR-32 / NFR-1..NFR-6 in [`docs/product/requirements.md`](../product/requirements.md).

## Problem Statement

A Care Coordinator needs to collect standardized, self-reported mental-health measures from patients
and act on the ones that signal risk - without drowning in manual scoring or losing track of who
needs attention. Today that means paper or ad-hoc forms, hand-scoring each Response, eyeballing which
patients crossed a clinical threshold, and having no shared, prioritized view of outstanding risk.
Acute-risk answers (self-harm intent) can be missed, and there is no audit trail for how each risk
was handled.

## Solution

The thinnest end-to-end slice of the PROM Intake platform that proves the whole architecture with a
real, demoable clinical workflow using **PHQ-9** as the first Instrument:

A Care Coordinator **assigns** PHQ-9 to an existing patient and receives a single-use, expiring
**Access link** to deliver out-of-band. The patient **opens the link without an account**, completes
the Instrument on a PHI-minimal page, and - the instant they give a positive answer to the acute-risk
item - sees an immediate, informational **Crisis Response** (client-side, independent of submission).
On submit, the server **scores** the Response automatically, **evaluates the Instrument's Triggers**,
and **raises Flags** for a patient who needs attention. Flags appear on a shared, prioritized
**Worklist**; a coordinator **Acknowledges** (claims) a Flag and later **Resolves** it with a
structured reason. Every Response, Score, and Flag transition is retained so "how was this risk
handled" is answerable from data.

The scoring/trigger engine is **instrument-agnostic**: PHQ-9 is pure configuration (a `Questionnaire`
with SDC `itemWeight` + a project-owned `InstrumentConfig`), so a future GAD-7 is new configuration,
not an engine change.

## User Stories

**Care Coordinator - assign & deliver**

1. As a Care Coordinator, I want to select an existing patient and assign them the PHQ-9 Instrument, so that they can complete a standardized self-report. (FR-5)
2. As a Care Coordinator, I want a minimal "create patient" capability when the patient does not yet exist, so that assigning is not blocked by full patient administration. (FR-12)
3. As a Care Coordinator, I want the Assignment delivered as a unique, single-use, expiring Access link, so that I can send it to the patient out-of-band. (FR-6)
4. As a Care Coordinator, I want the Access link to expire after a fixed period (14 days in v1), so that stale links cannot be used indefinitely. (FR-7)
5. As a Care Coordinator, I want to reissue by creating a new Assignment (a fresh link) rather than a separate "resend", so that there is one clear way to give a patient another chance. (FR-10)
6. As a Care Coordinator, I want each Assignment to move through Pending -> Completed -> Expired, so that I can tell the state of every assignment. (FR-9)

**Patient - completion & crisis response**

7. As a patient, I want to open my assigned Instrument through the link without creating an account, so that completing it is frictionless. (FR-13)
8. As a patient, I want the open page to show only the blank Instrument (no clinical or identifying data), so that a leaked link exposes no PHI. (NFR-5, ADR-0005)
9. As a patient, I want to be prevented from submitting until I have answered every required item (all 9 for PHQ-9), so that my Response is complete and valid. (FR-14)
10. As a patient, the moment I give a positive answer to the acute-risk item, I want to immediately see crisis resources, so that I am directed to help right away - whether or not I ever submit. (FR-15)
11. As a patient, if I leave without submitting, I want to be able to reopen the same link and start again until it expires, so that an interruption does not cost me the link. (FR-8, FR-16)
12. As a patient, when I open a link that is already used or expired, I want a friendly informational page (never an error or a blank form), so that I understand what happened. (FR-11)
13. As a patient, I want my completed answers submitted in one action, so that I am done in a single step. (FR-13)

**System - scoring & triggers**

14. As the platform, I want to represent an Instrument generically (items, answer options, scoring rules, Triggers are configuration), so that no scoring/trigger code is specific to one questionnaire. (FR-1)
15. As the platform, I want PHQ-9 provided as the first configured Instrument (9 items, each 0-3, total 0-27), so that the tracer bullet ships a real clinical measure. (FR-2)
16. As a Care Coordinator, I want a submitted Response scored automatically with no manual step, so that I never hand-score. (FR-3)
17. As a maintainer, I want to add a further Instrument (e.g. GAD-7) with only new configuration, so that the engine never changes to onboard an Instrument. (FR-4, NFR-2)
18. As the platform, I want every submitted Response and its computed Score persisted regardless of whether any Trigger fires, so that all data is retained. (FR-32)
19. As a Care Coordinator, I want a Flag raised when the total Score falls in a configured severity band (v1: >= 10, moderate-and-above), so that clinically significant patients surface. (FR-18)
20. As the platform, I want a critical-item trigger mechanism that raises a Flag from a specific item's answer independent of total Score, so that item-level risk is not hidden by a low total. (FR-19)
21. As a Care Coordinator, I want an acute-risk Trigger raised server-side on submit (PHQ-9 Item 9 >= 1), so that immediate-safety patients are flagged - independent of the client-side Crisis Response. (FR-20)
22. As the platform, I want multiple Triggers to be able to fire on one Response, each condition evaluated independently, so that a Response can raise more than one Flag. (FR-21)
23. As a Care Coordinator, I want each Flag to record which Trigger(s) raised it, so that I can see *why* the patient is flagged. (FR-22)

**Care Coordinator - worklist & resolution**

24. As a Care Coordinator, I want a shared Worklist of unresolved Flags for the organization, so that any coordinator can pick up any Flag. (FR-23)
25. As a Care Coordinator, I want the Worklist ordered acute-risk first, then by clinical severity, then oldest Open first within a tier, so that the most urgent patient is always on top. (FR-24)
26. As a Care Coordinator, I want an Acknowledged acute-risk Flag to still outrank any lower-priority Open Flag, so that clinical urgency dominates ownership. (FR-25)
27. As a Care Coordinator, I want to Acknowledge (claim) an Open Flag, with Acknowledged Flags staying visible (ranked below Open of the same tier) and showing the owner, so that work in progress is transparent. (FR-26)
28. As a Care Coordinator, when I try to Acknowledge a Flag another coordinator already claimed, I want to be told it is already claimed and by whom, so that a Flag never has two owners. (FR-26)
29. As a Care Coordinator, I want to Resolve a Flag and have it leave the active Worklist, so that finished work stops cluttering the list. (FR-27)
30. As a Care Coordinator, I want resolving to require selecting a Resolution reason from a predefined list (with an optional free-text note), so that *why* a Flag left is retained, not just that it did. (FR-28)
31. As a Care Coordinator, when I open a Flag I want to see the clinical signal - patient identity, Instrument and Response submission time, total Score and severity band, which Trigger(s) fired (acute-risk highlighted), and the item-level answers (notably Item 9), so that I can act on it. (FR-29)
32. As a compliance-minded coordinator, I want Flag lifecycle and resolutions retained as history (not hard-deleted), so that the workflow is auditable. (FR-30, NFR-6)

**Care Coordinator - access**

33. As a Care Coordinator, I want to authenticate before using the application via Medplum's built-in auth, so that patient data is protected. (FR-31, NFR-5)

**Cross-cutting**

34. As a product owner, I want every KPI computable from the application's own FHIR data (Response/Score/Flag transitions), so that outcomes are measurable without a separate analytics store. (NFR-1, NFR-6)
35. As a security reviewer, I want the only unauthenticated entry point to be the submit Bot under a narrow AccessPolicy (create `QuestionnaireResponse` only), so that a leaked link can at most submit one Response for one patient and read nothing. (NFR-5, ADR-0005)

## Implementation Decisions

All decisions below are settled architecture (ADR-0001..0009); listed so this spec is self-contained.
No file paths or code - those live in the implementation.

### Domain -> FHIR mapping

- **Instrument** = `Questionnaire` (items with unique `linkId`; answer options carry SDC `itemWeight`;
  total-score LOINC coding) **+** a project-owned **`InstrumentConfig`** (severity bands + cutoffs,
  Trigger definitions, total/panel LOINC codes, and the **acute-risk item identity** - which `linkId`
  drives the client Crisis Response, client-readable so FR-15 stays config-driven). (ADR-0004)
- **Response** = `QuestionnaireResponse`; the single source of truth for all item answers. (overview)
- **Score** = `Observation`, LOINC `44261-6` (total, quantitative), `derivedFrom` the QR. v1 writes
  **total-score only** (no per-item/panel Observations; item answers already live in the QR). Panel
  `44249-1`/item-level is an additive future change behind the Scoring engine's `ObservationEmitter`. (ADR-0004, data-model)
- **Assignment** = `Task` `code=assignment`; `focus`->Questionnaire, `for`->Patient,
  `restriction.period.end` = 14-day deadline; lifecycle Pending/Completed/Expired in `businessStatus`
  shadowing `status`. (ADR-0001, ADR-0003)
- **Flag** = `Task` `code=flag` (NOT FHIR `Flag`); single `owner`, `priority`, `focus`->Observation/QR,
  lifecycle Open/Acknowledged/Resolved in `businessStatus` shadowing `status` (ready/in-progress/
  completed), Resolution reason + `note`, plus first-class lifecycle timestamps (below). (ADR-0002, ADR-0003)
- **Access link** = a project-owned token resource binding `{ tokenHash -> Assignment/Patient/
  Questionnaire, status, expiry, audit }` - **only a hash is stored, never the raw token**. (ADR-0005)
- **Crisis Response** = **no resource**; client-side, informational only. (FR-15)
- **Project-owned CodeSystems:** task type (`assignment`/`flag`), flag status (`Open`/`Acknowledged`/
  `Resolved`), assignment status (`Pending`/`Completed`/`Expired`), resolution reason (the FR-28 enum;
  exact values below). Discriminator is `Task.code`, never inferred from resource shape. (ADR-0003)

### Modules (deep modules; each hides FHIR behind a domain interface - callers never touch `Task`/`Observation`/tokens)

- **Instrument** - load an Instrument's definition + config; expose scoring weights, severity bands,
  Trigger definitions, acute-risk item identity.
- **Assignment** - create / complete / expire an Assignment; query by patient/status. Only this module
  constructs the Assignment `Task`.
- **Access link** - issue a token for an Assignment; validate + consume on submit; audit. Owns the
  hashed-token resource, expiry/single-use logic, and the `publicWebhook` submit Bot. Depends on
  Assignment (the token binds to an Assignment). (ADR-0005)
- **Scoring engine** (runs in a Bot) - `score(response, config)` -> Score + Flags. Composes Instrument
  config load + scoring (sum `itemWeight`) + Trigger evaluation + Flag construction; contains **no
  instrument-specific code**. Internal `ObservationEmitter` translates results to `Observation`(s).
  Raises Flags via the **Flag module's** Flag-construction function and marks the Assignment complete
  via the **Assignment module's** function - never building a `Task` inline. (ADR-0004, ADR-0009)
- **`PriorityPolicy`** - pure, no FHIR: `order(flags)` implementing FR-24/25, ranking across Open
  **and** Acknowledged. Depends on nothing. (ADR-0007)
- **Worklist / Flag service** - list unresolved Flags (Open + Acknowledged) via `PriorityPolicy`;
  `acknowledge`; `resolve(reason, note)`. Owns the Flag `Task`, the `If-Match` claim, and the
  `412 -> FlagAlreadyClaimed` translation. Depends on `PriorityPolicy`. (ADR-0006, ADR-0007)

### Runtime & concurrency

- **Submit path:** patient posts token + answers to the **`publicWebhook` submit Bot** (scoped
  `AccessPolicy`: create `QuestionnaireResponse` only). The Bot validates the token hash server-side,
  **re-checks FR-14 completeness** against the Instrument's required items (client is untrusted),
  **atomically** consumes the token and creates the `QuestionnaireResponse` (subject = bound patient).
  The token burns exactly when the QR is created - resumable until then, no server-side draft. (ADR-0005)
- **Score/flag path:** a Medplum **Subscription** on `QuestionnaireResponse` creation fires the
  **Scoring Bot** (at-least-once delivery -> the Bot is **idempotent** via conditional creates/upserts
  keyed on `derivedFrom` + code). It always writes the Score Observation (FR-32) and conditionally
  raises a Flag `Task` per fired Trigger. (ADR-0004, event-flows)
- **Bots are thin adapters** over shared pure domain functions - no business rules in Bots; "only
  module X writes resource Y" holds inside Bots too. (ADR-0009)
- **Acknowledge concurrency:** optimistic concurrency via `If-Match` on the Flag `Task`'s version;
  first write wins, the loser gets `412` which the Worklist service translates to the domain outcome
  **`FlagAlreadyClaimed`** (carrying the current owner). The UI never sees `412`. Resolve uses the same
  pattern. (ADR-0006)

### Config-driven acute-risk & the two safety mechanisms (kept separate by design)

- **Client-side Crisis Response (FR-15):** fires the instant the acute-risk item is answered
  positively; reads the acute-risk item identity from `InstrumentConfig` (no literal "Item 9" in code);
  creates **no** server resource; can occur even if the patient never submits.
- **Server-side acute-risk Flag (FR-20):** raised only on a **submitted** Response by the Scoring Bot.
  The two are independent and may diverge (Crisis Response shown, no Flag) by design.

### KPI timestamps & audit (NFR-1 / NFR-6)

- Flag transitions are first-class on the `Task`: created = `authoredOn`, Acknowledged =
  `executionPeriod.start`, Resolved = `executionPeriod.end`. Each transition also writes a `Provenance`
  (actor + timestamp + resolution reason on resolve). KPIs are computable by plain query.

### Deferred-item resolutions (folded into this spec; called out for spec review)

- **Duplicate / multiple Responses & Flags:** v1 treats each submitted Response as independent; each
  fired Trigger raises its **own** Flag; **no dedup or linking** in v1 (multiple Flags may coexist for
  one patient). Dedup/linking is a future concern.
- **Resolution-reason enum (FR-28):** *Contacted patient · Follow-up scheduled · Referred to clinician
  · Escalated · No action needed · Duplicate / invalid response · Other (requires note)*. **"Escalated"
  is a recorded category only** - it triggers no downstream automation in v1 (coordinator notifications
  are out of scope); it records intent.
- **FR-8 "Resume" vs FR-16 no-draft:** the patient copy reads as **"start again"** - reopening the link
  presents the blank Instrument until expiry; nothing is persisted server-side between attempts.
- **Crisis Response content/locale:** **config-driven** off `InstrumentConfig` (client-readable),
  defaulting to US crisis resources (e.g. 988); not hard-coded, keeping FR-15 generic.
- **FR-19 (generic critical-item trigger):** the **mechanism is in scope** and proven via the synthetic
  second Instrument in tests; **PHQ-9 instantiates only the acute-risk trigger**, so v1 ships no
  non-acute PHQ-9 critical-item instance while the engine capability exists.
- **KPI targets:** numeric targets/guardrails remain **baseline-TBD** until demo data exists; not a
  gate on this tracer bullet. (NFR-1 measurability of the data is in scope; the *targets* are not.)

## Testing Decisions

Tests exercise behaviour **through each module's interface (its seam)**, at the highest seam that
still isolates the behaviour - never through internals, no snapshot-only assertions, no asserting FHIR
resource shapes or HTTP status codes directly (assert **domain outcomes**, e.g. `FlagAlreadyClaimed`).
`/implement` uses **TDD at these pre-agreed seams**. Integration points touch a **real Medplum test
project, never a mocked FHIR server** (Medplum is a core dependency; ADR-0008).

**Seams (match `testing-strategy.md` exactly):**

1. **`PriorityPolicy.order(flags)`** - **Unit**, pure. Richest coverage: every FR-24/25 ordering -
   acute-risk tier first, then severity, then oldest-Open-within-tier; Acknowledged acute-risk outranks
   lower-tier Open; within a tier Acknowledged ranks below Open.
2. **Scoring engine `score(response, config)`** - **Unit + Integration**. Given answers + config, assert
   the Score Observation(s) and exactly which Flags are raised (severity band, acute-risk item). Driven
   by **PHQ-9 and a synthetic second Instrument via config only** - the concrete proof of FR-4/NFR-2
   ("add GAD-7 = config"). No PHQ-9 literals in the engine.
3. **Worklist / Flag service `list` / `acknowledge` / `resolve`** - **Integration** (real Medplum).
   `list` returns unresolved Flags (Open + Acknowledged) ordered via `PriorityPolicy`. `acknowledge`
   under a concurrent race yields exactly one owner and `FlagAlreadyClaimed` for the loser (real
   `If-Match`). `resolve` records reason + note and removes the Flag from the active Worklist.
4. **Access link `issue` / `validate` / `consume`** - **Integration**. Single-use, expiry, invalid
   token, atomic consume-on-submit via the `publicWebhook` Bot; plus the **server-side FR-14
   completeness re-check** rejecting an incomplete submission before any QR is created.
5. **Assignment lifecycle** - **Integration**. Pending -> Completed -> Expired transitions through the
   Assignment module.
6. **Score Observation & Flag persistence** - **Integration**. Subscription -> Scoring Bot ->
   Observation always written (FR-32); Flag `Task` persisted per fired Trigger; Bot idempotent under
   redelivery (no double-write).
7. **Crisis Response** - **client seam**. Asserted to render on an acute-risk answer **and to create no
   server resource** - the guard on the FR-15/FR-20 separation.
8. **Tracer bullet** - **E2E**. assign -> open link -> submit -> score -> flag -> worklist -> acknowledge
   -> resolve.

**What makes a good test here:** assert domain outcomes at the interface; keep the scoring tests
instrument-agnostic (second synthetic Instrument, zero engine change); keep pure logic
(`PriorityPolicy`, scoring math) off-server for a healthy pyramid; integration tests provision/seed a
real Medplum test project (CI concern). Prior art: none yet - this tracer bullet establishes the
patterns; later specs follow these seams.

## Acceptance Criteria (per FR/NFR)

The slice is done when all of the following hold, each verifiable at the seam noted.

**Assign & deliver**
- [ ] A coordinator can assign PHQ-9 to an existing patient; a minimal create-patient path exists. (FR-5, FR-12)
- [ ] Assigning mints a unique, single-use Access link with a 14-day expiry held as one config value. (FR-6, FR-7)
- [ ] Reissue = new Assignment/new link; no separate resend. (FR-10)
- [ ] Assignment moves Pending -> Completed -> Expired. (FR-9)

**Patient completion & crisis**
- [ ] The Instrument opens via the link with no account; the open page is PHI-minimal. (FR-13, NFR-5)
- [ ] Submission is blocked client-side until all required items are answered **and** re-checked server-side in the submit Bot. (FR-14)
- [ ] A positive acute-risk answer shows the Crisis Response immediately, client-side, creating no server resource. (FR-15)
- [ ] The link is resumable ("start again") until expiry; no server-side draft persists. (FR-8, FR-16)
- [ ] A used/expired link shows a friendly informational page. (FR-11)

**Scoring & triggers**
- [ ] Instrument is represented generically; PHQ-9 configured (9 items 0-3, total 0-27). (FR-1, FR-2)
- [ ] A submitted Response is scored automatically, no manual step. (FR-3)
- [ ] Adding a second Instrument is config-only, proven by the synthetic Instrument driving the engine. (FR-4, NFR-2)
- [ ] Every submitted Response + its Score are persisted regardless of flagging. (FR-32)
- [ ] Severity-band Trigger raises a Flag at total >= 10; critical-item mechanism exists; acute-risk Trigger raises a Flag on Item 9 >= 1 at submit. (FR-18, FR-19, FR-20)
- [ ] Multiple Triggers can fire on one Response; each Flag records which Trigger raised it. (FR-21, FR-22)

**Worklist & resolution**
- [ ] The shared Worklist lists unresolved Flags ordered acute-risk -> severity -> oldest-Open, ranking across Open + Acknowledged. (FR-23, FR-24, FR-25)
- [ ] Acknowledge claims a Flag single-owner; a concurrent second claim is told "already claimed by <name>" (`FlagAlreadyClaimed`). (FR-26)
- [ ] Resolve requires a Resolution reason (predefined enum) + optional note and removes the Flag from the active Worklist. (FR-27, FR-28)
- [ ] Opening a Flag shows patient identity, Instrument + submission time, total Score + band, which Trigger(s) fired (acute-risk highlighted), and item-level answers (incl. Item 9). (FR-29)
- [ ] Flag lifecycle + resolutions retained as history (no hard delete). (FR-30, NFR-6)

**Access & cross-cutting**
- [ ] Coordinators authenticate via Medplum built-in auth. (FR-31)
- [ ] Every KPI in goals-and-metrics is computable from app FHIR data (transition timestamps + Provenance present). (NFR-1, NFR-6)
- [ ] The only unauthenticated entry point is the submit Bot under a scoped AccessPolicy (create QR only). (NFR-5)

## Out of Scope

Do not build in this slice: multi-tenancy; recurring/scheduled assignments; coordinator-side
notifications/push; longitudinal/trend tracking; reporting dashboard; outstanding-assignment screens;
automated reminders; a second **shipped** Instrument (a synthetic one exists only in tests);
per-instrument/per-organization configurability of expiry or cutoff; intra-org access scoping among
coordinators (v1: all coordinators see all Flags/patients); per-item/panel Observations; a runtime
rules engine; numeric KPI targets/guardrails (baseline-TBD); read-only view of a claimed Flag for the
losing coordinator (FR-26 B2, deferred). Crisis Response is **informational only** - not an
emergency/crisis/real-time-monitoring capability (NFR-4).

## Further Notes

- **Do not deviate from the ADRs.** If an implementation detail seems to require changing a decision,
  surface it as an ADR update in review - do not silently deviate. (ADR-0001..0009 all accepted.)
- The **Access-link seam is the highest-risk boundary** and is explicitly slated for a dedicated
  security review at implementation. (ADR-0005, security.md)
- Client framework and repo layout are settled at the first-code milestone; they do not affect the
  resource model or seams above. `/setup-pre-commit` and `/setup-ts-deep-modules` run at that milestone.
- After spec review, `/to-tickets` cuts vertical slices (each demoable, one per fresh session) with
  blocking edges. Natural slice fault-lines: Instrument+Assignment+Access-link (assign/deliver),
  submit+score+flag, Worklist list/acknowledge/resolve - but sizing is a `/to-tickets` call.

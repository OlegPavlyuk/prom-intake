# Requirements

**Status:** Draft - Product Discovery in progress (2026-07-13). Requirements below are validated
decisions from discovery unless marked **(assumption - confirm)**.

Terms are defined in [`CONTEXT.md`](../../CONTEXT.md). Clinical facts are cited to
[`docs/research/phq-9-scoring-and-interpretation.md`](../research/phq-9-scoring-and-interpretation.md).

## Scope

**In scope (v1):** the end-to-end tracer bullet for a single organization -
assign an Instrument -> patient completes via Access link -> Response scored -> Triggers evaluated ->
Flags raised -> Care Coordinator works the Worklist to resolution. PHQ-9 is the first (and only
shipped) Instrument, configured through the generic engine.

**Out of scope (v1):** see the non-goals in [`vision.md`](vision.md), plus: longitudinal/trend
tracking, recurring/scheduled assignments, coordinator-side notifications (fast-follow), outstanding-
assignment screens, automated reminders, multi-tenancy, and any second Instrument (must be *possible*
by configuration, not *shipped*).

## Actors

- **Care Coordinator** - authenticated staff user; primary actor.
- **Patient** - completes an assigned Instrument via an Access link; not an authenticated account in v1.

## Functional requirements

Priority: **Must** = required for v1; **Should** = strongly wanted; **Could** = nice-to-have.

### Instruments & scoring

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-1 | The system represents an **Instrument** generically: its items, answer options, scoring rules, and Triggers are data/configuration, not code specific to one questionnaire. | Must |
| FR-2 | PHQ-9 is provided as the first configured Instrument: 9 items, each scored 0-3, total range 0-27. | Must |
| FR-3 | When a Response is submitted, the system computes its **Score** automatically from the Instrument's scoring rules, with no manual step. | Must |
| FR-4 | Adding a further Instrument (e.g. GAD-7) requires only new configuration (items, scoring, Triggers), not changes to the scoring/trigger engine. | Must |

### Assignment & delivery

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-5 | A Care Coordinator can create an **Assignment** of an Instrument to an existing patient. | Must |
| FR-6 | An Assignment is delivered to the patient as a unique, single-use, expiring **Access link**. | Must |
| FR-7 | Access links expire after a fixed period (14 days in v1), held as a single configuration value. Per-instrument or per-organization expiry is deferred (see Deferred findings). | Must |
| FR-8 | A successful Response submission consumes the link; an unsubmitted attempt may be resumed via the same link until expiry. | Must |
| FR-9 | An **Assignment** has status **Pending -> Completed -> Expired**, tracked in the data model. | Must |
| FR-10 | Reissuing is done by creating a new Assignment (new Access link); there is no separate "resend". | Should |
| FR-11 | A used or expired Access link shows a friendly informational page (never an error or blank form). | Must |
| FR-12 | A Care Coordinator can select an **existing patient** when assigning. Patients may be seeded, and a minimal "Create Patient" capability is acceptable; full patient administration is out of scope. | Should |

### Patient completion & crisis response

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-13 | A patient can complete the assigned Instrument through the Access link without an account. | Must |
| FR-14 | A Response cannot be submitted until all items the Instrument marks required are answered (for PHQ-9, all 9). *Product convention, not a PHQ-9 mandate.* | Must |
| FR-15 | **Client-side acute-risk safety check.** The moment a patient gives a **positive answer to an Acute-risk item** (PHQ-9 Item 9 >= 1), the client immediately shows the **Crisis Response** (informational-only crisis resources), independent of whether the Response is ever submitted. This is a patient-facing client-side mechanism only: it raises **no Flag** and requires no submission or server evaluation. It is separate from, and may occur without, the server-side acute-risk Trigger (FR-20). | Must |
| FR-16 | No partial/draft answers are persisted server-side in v1. | Should |

### Triggers & flags

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-17 | An Instrument may define zero or more **Triggers**; each evaluates a submitted Response and, if its condition is met, raises a **Flag**. | Must |
| FR-18 | **Severity-band trigger:** raise a Flag when the total Score falls in a configured band. For PHQ-9, bands are 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe; v1 flags **>= 10 (moderate and above)**, the clinical "further evaluation" threshold. The cutoff is a property of the Instrument's own configuration (a per-instrument extension point); per-organization overrides are deferred. | Must |
| FR-19 | **Critical-item trigger:** raise a Flag from a specific item's answer, independent of total Score. | Must |
| FR-20 | **Acute-risk trigger (server-side, on submit).** A critical-item trigger denoting immediate safety risk; for PHQ-9, Item 9 >= 1. On submission it raises an acute-risk Flag. It is **independent of** the client-side Crisis Response (FR-15): the Crisis Response is shown immediately on the client and may occur even when this Trigger never fires a Flag (e.g. the patient abandons without submitting). *"Item 9 >= 1" is a product convention operationalizing the manual's "any positive response".* | Must |
| FR-21 | Multiple Triggers may fire on one Response; each independent condition is evaluated. | Must |
| FR-22 | A Flag records which Trigger(s) raised it, so the coordinator sees *why* the patient is flagged. | Must |
| FR-32 | Every submitted Response and its computed Score are persisted, regardless of whether any Trigger fires or any Flag is raised. | Must |

> **Two independent mechanisms.** The patient-facing **Crisis Response** (FR-15) is *not* a Trigger:
> it is an immediate client-side reaction to an acute-risk answer and creates nothing on the server.
> **Triggers** (FR-17-FR-22) run only on a **submitted** Response and produce **Flags**. The two can
> diverge - a patient may see the Crisis Response yet never submit, so no Flag is raised.

### Worklist & resolution

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-23 | The **Worklist** shows unresolved Flags for the organization, shared across all coordinators. | Must |
| FR-24 | Worklist ordering follows a fixed v1 priority: (1) Acute-risk Flags first; (2) then by clinical severity; (3) within a tier, oldest **Open** first. The ordering is encapsulated behind a single priority function so future factors can be added later; a general configurable rules engine is deferred. | Must |
| FR-25 | Clinical urgency dominates ownership: an **Acknowledged** Acute-risk Flag still ranks above any lower-priority **Open** Flag. | Must |
| FR-26 | A coordinator can **Acknowledge** an Open Flag (claim it). Acknowledged Flags remain visible, ranked below Open Flags of the same tier, showing the owning coordinator. **Business rule:** if two coordinators try to Acknowledge the same Open Flag, the first to claim it becomes the sole owner and the second is told it is already claimed (and by whom); a Flag has at most one owner. The concurrency mechanism is an Architecture concern. | Must |
| FR-27 | A coordinator can **Resolve** a Flag, which removes it from the active Worklist. | Must |
| FR-28 | Resolving requires selecting a **Resolution reason** from a predefined list, with an optional free-text note. v1 reasons: *Contacted patient · Follow-up scheduled · Referred to clinician · Escalated · No action needed · Duplicate / invalid response · Other (requires note)*. | Must |
| FR-29 | Opening a Flag shows the clinical signal: patient identity, Instrument and Response submission timestamp, total Score and severity band, which Trigger(s) fired (Acute-risk highlighted), and the item-level answers (notably Item 9). | Must |
| FR-30 | Flag lifecycle and resolutions are retained as history (not hard-deleted) for audit. | Should |

### Coordinator access

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-31 | Care Coordinators authenticate before using the application, using Medplum's built-in authentication. | Must |

## Non-functional requirements

| ID | Category | Requirement |
| -- | -------- | ----------- |
| NFR-1 | **Measurability** | Every product KPI in [`goals-and-metrics.md`](goals-and-metrics.md) must be computable from the application's own data (FHIR resources + workflow records). Binding constraint on the data model. |
| NFR-2 | **Extensibility** | Adding a new Instrument (items, scoring, triggers) is configuration, not an engine change - the primary earned extension point. Worklist priority is encapsulated behind a single function so later factors can be added. Generalized per-organization configuration and a runtime rules engine are explicitly deferred (see Deferred findings). |
| NFR-3 | **Interoperability** | Clinical data is modeled on FHIR (Questionnaire, QuestionnaireResponse, Observation, etc.) via Medplum, using standard codes where they exist (e.g. PHQ-9 LOINC panel 44249-1, total 44261-6). Detailed modeling is an architecture-phase decision. |
| NFR-4 | **Safety boundary** | The product is not an emergency/crisis/real-time-monitoring system (see vision non-goals). The Crisis Response is informational only. |
| NFR-5 | **Privacy** | Patient clinical data is protected health information; access is restricted to authenticated coordinators; Access links are unguessable, single-use, and expiring. Full security posture is an architecture-phase concern. |
| NFR-6 | **Auditability** | Flag creation, acknowledgement, and resolution (with reason) are recorded such that "how was this risk handled" is answerable from data. |

## Product conventions (not instrument mandates)

Called out explicitly so specs and code do not over-claim clinical authority:

- **Acute-risk = Item 9 >= 1** operationalizes the PHQ-9 manual's "any positive response" guidance.
- **All items required for a valid Response** is a product rule; PHQ-9 defines no missing-data rule.
- **Severity flagging cutoff** (v1: >= 10) is a configurable product choice within the official bands.

## Product assumptions (v1)

- **Access-link security model.** An Access link carries a high-entropy, unguessable, single-use,
  expiring token. In v1, **possession of a valid token is the authorization**: it grants access
  solely to that one Assignment's Instrument for that one patient - nothing else. There is no patient
  login. The coordinator delivers the link out-of-band, and treating the token as a bearer secret is
  an accepted v1 trade-off. Link hardening (delivery channel, revocation, and what PHI is shown when
  a link is opened) is an Architecture concern.

## Deferred findings (from the product review)

Resolved findings are folded into the requirements above. These are intentionally deferred:

**To Architecture:**
- Access-link hardening: delivery channel, token revocation, expiry enforcement, and what PHI a link
  reveals on open (supports the Access-link security assumption).
- Concurrency mechanism behind the Acknowledge business rule (FR-26) and Resolve.
- Access scoping among coordinators within the single org (v1 assumes all coordinators see all
  patients and Flags).
- Whether per-instrument / per-organization configurability (expiry, cutoff) is ever reintroduced,
  and how the priority function is allowed to evolve.
- Persistence and FHIR representation of Responses, Scores, and Flags (supports FR-32, NFR-1).

**To Feature Specifications:**
- Quantify KPI targets and guardrail thresholds once baselines / demo data exist.
- Duplicate / multiple Responses and Flags per patient: dedup or linking rules.
- "Escalated" resolution reason (FR-28): define what escalation does downstream, or rename.
- "Resume" wording (FR-8) vs no-draft-persistence (FR-16): clarify copy so it reads as "start again".
- Crisis Response resource content and locale (e.g. US 988 vs configurable).
- Whether FR-19 (generic non-acute critical-item trigger) stays a v1 Must, given it has no PHQ-9
  instantiation.

## Related

- Vision: [`vision.md`](vision.md) · Problem: [`problem-statement.md`](problem-statement.md)
- Goals & metrics: [`goals-and-metrics.md`](goals-and-metrics.md)
- Features: [`features.md`](features.md) · Roadmap: [`roadmap.md`](roadmap.md)
- Glossary: [`CONTEXT.md`](../../CONTEXT.md)

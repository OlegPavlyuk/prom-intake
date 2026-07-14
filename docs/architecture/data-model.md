# Data Model

**Status:** Accepted (v1) - 2026-07-13. Names use [CONTEXT.md](../../CONTEXT.md) terms; resource
choices are recorded in [`docs/adr/`](../adr/).

## Stores

A single store: the **Medplum FHIR server**. Everything - clinical data, workflow state, and the
Access-link token - lives as FHIR resources in one Medplum project. This keeps one source of truth
and one audit trail (Medplum versions every resource), and keeps every product KPI computable from
app data (NFR-1). No second datastore in v1 ([ADR-0005](../adr/0005-access-link-security-model.md),
[ADR-0008](../adr/0008-integration-tests-against-real-medplum.md)).

## Entities

```mermaid
erDiagram
  Questionnaire ||--o{ QuestionnaireResponse : "completed as"
  Questionnaire ||--|| InstrumentConfig : "configured by"
  Questionnaire ||--o{ AssignmentTask : "focus of"
  Patient ||--o{ AssignmentTask : "for"
  AssignmentTask ||--|| AccessToken : "delivered via"
  AssignmentTask ||--o| QuestionnaireResponse : "fulfilled by"
  QuestionnaireResponse ||--|| ScoreObservation : "derivedFrom"
  QuestionnaireResponse ||--o{ FlagTask : "raises"
  Practitioner ||--o{ FlagTask : "owner"
```

### Resource mapping

| Domain concept | FHIR resource | Key fields |
| -------------- | ------------- | ---------- |
| **Instrument** | `Questionnaire` | items with unique `linkId`; answer options carry SDC **`itemWeight`**; total-score LOINC coding |
| Instrument config | project-owned **`InstrumentConfig`** | severity bands + cutoffs; Trigger definitions; total/panel LOINC codes; **acute-risk item identity** (which `linkId`, if any, drives the client Crisis Response - client-readable so FR-15 stays config-driven, not hard-coded) |
| **Response** | `QuestionnaireResponse` | `subject`->Patient; links Questionnaire canonical; **source of truth for all item answers** |
| **Score** | `Observation` | LOINC **`44261-6`** (total, quantitative); `derivedFrom`->QR; `subject`->Patient |
| **Assignment** | `Task` `code=assignment` | `focus`->Questionnaire; `for`->Patient; `restriction.period.end`=deadline; `status`+`businessStatus` = Pending/Completed/Expired |
| **Flag** | `Task` `code=flag` | `owner` (single); `priority`; `focus`->Observation/QR; `businessStatus`=Open/Acknowledged/Resolved; `note`; resolution reason; **lifecycle transition timestamps** (see below) |
| **Access link** | project-owned token resource | `tokenHash` (never raw); binding->Assignment/Patient/Questionnaire; status; expiry; audit (issued/opened/submitted/expired/invalid) |
| **Crisis Response** | none | client-side only (FR-15) |

### Project-owned CodeSystems ([ADR-0003](../adr/0003-task-modeling-conventions.md))

- **Task type** (`.../CodeSystem/task-code`): `assignment`, `flag` - the `Task.code` discriminator.
- **Flag status** (`.../CodeSystem/flag-status`): `Open`, `Acknowledged`, `Resolved` - the Flag
  `businessStatus`.
- **Assignment status** (`.../CodeSystem/assignment-status`): `Pending`, `Completed`, `Expired`.
- **Resolution reason** (`.../CodeSystem/resolution-reason`): the predefined FR-28 enum (exact
  values finalized at feature-spec time).
- `status`/`businessStatus` mapping table: see [ADR-0003](../adr/0003-task-modeling-conventions.md).

### InstrumentConfig carrier - a project-owned `Basic` ([ADR-0004](../adr/0004-scoring-and-trigger-engine.md))

[ADR-0004](../adr/0004-scoring-and-trigger-engine.md) settles the *two homes* for Instrument
configuration and delegates the `InstrumentConfig` **schema** here. It is carried as a FHIR **`Basic`**
resource - FHIR's designated resource for a project-owned concept it does not otherwise model:

- **Identity:** `Basic.identifier` carries the Instrument's stable key (system
  `.../instrument-key`); the same identifier is on the `Questionnaire`, binding the two homes. The
  `Questionnaire` is looked up by its canonical `url` (also held in the config).
- **Type marker:** `Basic.code` is a project coding (`instrument-config`) so InstrumentConfigs are a
  queryable, explicit type - never inferred from shape.
- **Payload (structured extensions under one root extension):** the severity bands (code/label/min/
  max, open-ended top band omits max), the Trigger definitions (a discriminated set - severity-band
  with a score cutoff, critical-item with a `linkId` + answer-weight threshold + an `acuteRisk` flag),
  the total/panel LOINC codes, and the **acute-risk item `linkId`** (a simple, prominent field so the
  patient client can read it directly and keep the Crisis Response config-driven; FR-15).
- **Scoring weights are *not* here:** per-answer weights live on the `Questionnaire` via SDC
  `itemWeight` (ADR-0004); the config carries everything FHIR/SDC does not model.

The **Instrument module** ([`module-boundaries.md`](module-boundaries.md)) owns this mapping end to
end (`loadInstrument` composes the `Basic` + `Questionnaire` into one domain `Instrument`; its seed
writes both). Nothing else reads the `Basic`. The carrier is a reversible detail behind that seam, so
it is recorded here rather than as its own ADR.

### Assignment lifecycle mapping ([ADR-0003](../adr/0003-task-modeling-conventions.md))

[ADR-0003](../adr/0003-task-modeling-conventions.md) fixes that the Assignment lifecycle lives in
`Task.businessStatus` (project `assignment-status` CodeSystem) shadowing a coherent standard
`Task.status`, and delegates the exact mapping here:

| Domain (`businessStatus`) | FHIR `Task.status` | Meaning |
| ------------------------- | ------------------ | ------- |
| Pending                   | `requested`        | a request awaiting fulfilment |
| Completed                 | `completed`        | the patient submitted a Response |
| Expired                   | `cancelled`        | the request lapsed unused |

`businessStatus` is authoritative (it carries the domain word); `status` is derived from it so
Medplum's Task tooling and status search keep working. The Assignment module reads `businessStatus`
back as the domain status and queries by the shadow `status`. Only the Assignment module reads or
writes the assignment `Task`.

### Access-link token carrier - a project-owned `Basic` ([ADR-0005](../adr/0005-access-link-security-model.md))

The Access-link token binding is carried as a project-owned **`Basic`** (the same pattern as the
InstrumentConfig carrier - FHIR's designated resource for a project concept it does not otherwise
model). Only a **hash** of the token is stored, never the raw token (ADR-0005):

- **Lookup key:** `Basic.identifier` carries the token's SHA-256 hash (system `.../access-token-hash`).
  Validation hashes the presented raw token and looks the record up by that hash - a datastore leak
  yields no working link. A high-entropy (256-bit) random token needs no salt/KDF; a fast hash is
  sufficient because the token space is not brute-forceable.
- **Type marker:** `Basic.code` is a project coding (`access-link-token`) so tokens are a queryable,
  explicit type - never inferred from shape.
- **Binding + audit (structured extensions under one root):** the Assignment (`Task` reference), the
  Questionnaire canonical URL, the token status (`issued`; `consumed` added with the submit burn),
  the expiry (mirrors the Assignment deadline, so the 14-day value has one home), and the issued-at
  audit stamp. The bound Patient is `Basic.subject`.

The **Access-link module** owns this mapping end to end; nothing else reads the token `Basic`. The
carrier is a reversible detail behind that seam, so it is recorded here rather than as its own ADR.

### Score Observation shape (v1: total only)

v1 writes **one total-score `Observation`** (LOINC `44261-6`), not per-item or panel Observations.
Item-level answers already live durably and queryably in the `QuestionnaireResponse`; per-item
Observations would duplicate that data with no v1 consumer (Triggers read answers in the Bot at
evaluation time). Every v1 KPI is computable from total-score Observations + Task records + QRs
(NFR-1). Panel (`44249-1`) and item-level Observations are an **additive** change behind the Scoring
engine's `ObservationEmitter`, to be introduced only when a concrete metric/interoperability need
justifies them. _(Additive + reversible, so no standalone ADR - recorded here.)_

### Flag lifecycle timestamps (KPI-computable, NFR-1/NFR-6)

Two KPIs need the *time of each Flag transition*: time-to-acknowledge (Open -> Acknowledged) and
time-to-resolve (Open -> Resolved). These are recorded **first-class**, not reconstructed from
resource version history:

- **Created (Open):** `Task.authoredOn`.
- **Acknowledged:** `Task.executionPeriod.start` (set when a coordinator claims the Flag).
- **Resolved:** `Task.executionPeriod.end`.
- **Full audit (NFR-6):** each transition also writes a `Provenance` recording actor + timestamp
  (and the Resolution reason on resolve), so "how was this risk handled" is answerable from data
  without version-history archaeology.

This keeps every KPI in [`goals-and-metrics.md`](../product/goals-and-metrics.md) computable by
plain query (NFR-1).

## Ownership & access

Each module owns its resource type through its interface (see
[`module-boundaries.md`](module-boundaries.md)); no module reads another's resources directly. In
v1 all Care Coordinators see all Flags/patients within the single organization (multi-tenancy and
intra-org access scoping are out of scope / deferred). The `publicWebhook` submit Bot runs under a
narrow `AccessPolicy` scoped to create `QuestionnaireResponse` only.

## Migrations

FHIR resources are schema-flexible; the migration surface in v1 is the project-owned
`InstrumentConfig` and CodeSystems (reference/config data) plus Questionnaire/AccessPolicy
definitions. Medplum retains version history; no hard deletes (FR-30, NFR-6). Tooling and
forward/rollback policy are settled at the first-code milestone.

# Security & Privacy

**Status:** Accepted (v1) - 2026-07-13. The Access-link mechanism is the highest-risk seam and is
slated for a dedicated security review at implementation ([ADR-0005](../adr/0005-access-link-security-model.md)).

## Threat model

**Assets:** patient PHI (Responses, Scores), the Worklist, and the Access-link tokens (a bearer
secret authorizing one submission).

**Trust boundaries:**
- Authenticated Care Coordinators (Medplum auth) <-> Medplum project.
- **Unauthenticated patient** <-> the `publicWebhook` submit Bot (the sharpest boundary).

**Top threats designed against:**
- Leaked Access link -> unauthorized access. Mitigations: token is a high-entropy secret; the open
  page is **PHI-minimal** (renders only the blank Instrument, no patient/clinical data); a leaked
  link can at most submit **one** Response for **one** patient and can read nothing.
- Token theft from storage -> only a **hash** is stored (never the raw token); a store leak yields
  no working links.
- Replay / double submission -> single-use. Medplum transaction Bundles are not atomic on a failed
  precondition (verified at implementation), so the burn is an **optimistic-lock compare-and-swap**
  on the token (`If-Match`, `issued -> consumed`): exactly one concurrent submit wins, the loser is
  refused, and a Response-create failure reverts the burn (the safe direction - a stuck link is
  reissued, never double-submitted). Plus expiry (14 days, FR-7). See
  [ADR-0005](../adr/0005-access-link-security-model.md).
- Over-broad write from the public endpoint -> the submit Bot runs under a narrow `AccessPolicy`.
  Its net capability is: **create** one `QuestionnaireResponse` (create-only, no read - answers
  cannot be harvested), **read/update** the access-link token `Basic` (to validate + burn), read the
  blank `Questionnaire` + `InstrumentConfig` (non-PHI reference data, for the completeness re-check),
  and **update** the bound assignment `Task` to Completed (write restricted by `criteria` to
  `code=assignment`, never Flags). No `Patient` or `Observation` access at all. This is wider than
  the literal "create `QuestionnaireResponse` only" of ADR-0005 - the token burn and the FR-8/FR-9
  Assignment completion both require scoped writes - but a leaked link still reads no PHI and can
  submit at most one Response for one patient. The real per-Assignment scoping is the token binding
  enforced in the Bot's code; the `AccessPolicy` is defence in depth. Deploy pipeline in
  [infrastructure.md](infrastructure.md).

## Authentication & authorization

- **Care Coordinators:** Medplum's built-in authentication (FR-31). v1 is single-organization; all
  coordinators see all Flags/patients (intra-org access scoping deferred).
- **Patients:** no account (account-less by product decision). Authorization is possession of a
  valid single-use token bound to one Assignment - the accepted bearer-secret model
  ([ADR-0005](../adr/0005-access-link-security-model.md)).
- **`publicWebhook` Bot:** the only unauthenticated entry point; explicitly enabled
  (`Bot.publicWebhook`) and constrained by a scoped `AccessPolicy`. The
  [Patient completion page](../../CONTEXT.md) is a **separate, credential-free build**
  ([ADR-0010](../adr/0010-frontend-architecture.md)) that never holds a coordinator session, so this
  boundary is enforced at the bundle level, not only by convention.
- **Coordinator app:** authenticates directly against Medplum's built-in auth and calls the FHIR API
  under the coordinator's own session/`AccessPolicy` - **no backend-for-frontend** interposes a second
  trust boundary or a place PHI transits ([ADR-0010](../adr/0010-frontend-architecture.md)).

## Secrets management

The Access-link raw token is never persisted (hash only) and never logged. Medplum client/bot
secrets follow Medplum's secret handling; never committed. (Concrete secret store settled at the
first-code milestone.)

## Data protection & compliance

- Encryption in transit (HTTPS) and at rest (Medplum-managed).
- **Retention:** Flags, Responses, Scores, and resolution history are retained, not hard-deleted
  (FR-30, NFR-6); Medplum version history provides the audit trail.
- **Audit:** the Access-link token resource records issued / first-opened / submitted / expired /
  invalid-attempt metadata for troubleshooting and security review. Each **Flag lifecycle
  transition** (created/acknowledged/resolved) writes a `Provenance` (actor + timestamp + resolution
  reason), so "how was this risk handled" is answerable from data (NFR-6); see
  [`data-model.md`](data-model.md).
- This is a portfolio project with synthetic data; it is designed *as if* real (PHI-grade handling)
  but makes no formal regulatory certification claim. Any compliance-driven trade-off gets an ADR.

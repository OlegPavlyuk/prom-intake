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
- Replay / double submission -> single-use, **consumed atomically** with `QuestionnaireResponse`
  creation; expiry (14 days, FR-7).
- Over-broad write from the public endpoint -> the submit Bot runs under a narrow `AccessPolicy`
  scoped to create `QuestionnaireResponse` only.

## Authentication & authorization

- **Care Coordinators:** Medplum's built-in authentication (FR-31). v1 is single-organization; all
  coordinators see all Flags/patients (intra-org access scoping deferred).
- **Patients:** no account (account-less by product decision). Authorization is possession of a
  valid single-use token bound to one Assignment - the accepted bearer-secret model
  ([ADR-0005](../adr/0005-access-link-security-model.md)).
- **`publicWebhook` Bot:** the only unauthenticated entry point; explicitly enabled
  (`Bot.publicWebhook`) and constrained by a scoped `AccessPolicy`.

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

---
status: accepted
date: 2026-07-13
---

# Account-less Access link: token model and security envelope

The [Access link](../../CONTEXT.md) - v1's delivery mechanism that lets an assigned patient
complete one Instrument without an account - has **no Medplum-documented pattern**; we design it
here. Product Discovery already accepted the bearer model ("possession of a valid token authorizes
that one Assignment's Instrument only; no patient login"). This ADR fixes the implementation
envelope. It is a **security-critical boundary** to be reviewed carefully at implementation.

See [research](../research/medplum-prom-architecture.md) §6.

## Mechanism

1. **Issuance.** When the Assignment [`Task`](0001-assignment-as-fhir-task.md) is created, mint a
   high-entropy single-use token with a 14-day expiry (FR-7). Persist a **project-owned FHIR
   resource** binding `{ tokenHash -> Assignment / Patient / Questionnaire, status, expiry, audit }`.
2. **Open.** An unauthenticated app route resolves the token and, only if valid/unused/unexpired,
   renders that one Instrument. Used/expired -> friendly page (FR-11).
3. **Submit.** The app posts answers to a **`publicWebhook` Bot** whose `AccessPolicy` is scoped to
   *only* create `QuestionnaireResponse`. The Bot validates the token hash server-side, sets
   `subject` to the bound patient, **atomically** consumes the token and creates the
   `QuestionnaireResponse` - which then fires the scoring Subscription (ADR-0004).

## Decisions and rationale

- **Token storage - project-owned FHIR resource, hashed (A1).** The binding lives in the same
  Medplum/FHIR datastore as everything else: single source of truth, one consistent audit trail
  (Medplum versions every resource), no second persistence layer, and it keeps token lifecycle data
  computable alongside app metrics (NFR-1). **Only a cryptographically secure hash of the token is
  stored, never the raw token**; validation compares hashes. A datastore leak yields no working
  links.
- **Open step is PHI-minimal.** The link renders only the blank Instrument - **no** patient name or
  clinical data. A leaked link therefore exposes no PHI on read; its only capability is submitting
  one Response. Consistent with "not a patient portal."
- **Single-use = consume on successful submit only.** The link is resumable until submit with no
  server-side draft (FR-8, FR-16); the token burns exactly when the `QuestionnaireResponse` is
  created. Consumption and response creation are **atomic on the server** (in the `publicWebhook`
  Bot) to eliminate races and double submissions.
- **Submission via `publicWebhook` Bot + scoped `AccessPolicy`.** The cleanest fit for
  "unauthenticated caller submits data" given Medplum's primitives. The narrow `AccessPolicy`
  (create `QuestionnaireResponse` only) bounds a leaked link to at most one submission for one
  patient - never reading other data. Rejected alternatives: real patient accounts / open
  registration (contradicts the account-less product decision, adds friction) and a long-lived
  front-end `ClientApplication` credential (too broad, no per-Assignment scoping).

## Additional requirements

- **Audit metadata** on the token resource: issued, first opened, submitted, expired, and
  invalid-attempt records - to support troubleshooting and future security review.
- **Module isolation.** The entire Access-link mechanism sits behind a dedicated module/interface,
  so it can evolve (or be swapped for a portal/SMS/email/auth strategy) independently of the domain
  model. The domain works with Assignment; the link is delivery only (per [ADR-0001](0001-assignment-as-fhir-task.md)).

## Consequences

- A project-owned token resource type + its lifecycle logic (single-use, expiry, invalid-attempt
  handling) are invented and owned by one module; detailed in the security doc + data model.
- This is the highest-risk seam in v1 and is explicitly slated for security review during
  implementation (an Architecture deferred item).

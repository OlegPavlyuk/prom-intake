// The Access-link domain vocabulary (pure, no FHIR). Entry point of the `domain`
// package. An Access link is v1's delivery mechanism: a unique, expiring,
// single-use URL that lets an assigned patient open and complete one Instrument
// without an account (CONTEXT.md). The Access-link module maps these types to a
// project-owned, hashed-token FHIR resource at its seam (ADR-0005); nothing here
// knows about FHIR.

/** What an Access-link token is bound to - resolved when the token is validated. */
export interface AccessLinkBinding {
  /** The Assignment (its `Task` id) this link fulfils. */
  readonly assignmentId: string;
  /** The patient the link is for; a submitted Response is attributed to them. */
  readonly patientId: string;
  /** Canonical URL of the Instrument's `Questionnaire` to render. */
  readonly questionnaireUrl: string;
}

/**
 * The result of issuing an Access link. The raw {@link token} is the single-use
 * secret and is returned **exactly once** - only its hash is ever stored
 * (ADR-0005). Assembling the patient-facing URL from the token is the delivery
 * layer's job.
 */
export interface IssuedAccessLink {
  /** The high-entropy, single-use token. Never persisted in the clear. */
  readonly token: string;
  /** ISO-8601 expiry (mirrors the Assignment deadline; FR-7). */
  readonly expiresAt: string;
  /** What the token resolves to when validated. */
  readonly binding: AccessLinkBinding;
}

/**
 * The outcome of validating a presented raw token. A valid token carries its
 * {@link AccessLinkBinding}; every other outcome is a distinct domain state the
 * open page (FR-11) renders as a friendly message - never an error or a form.
 * (`consumed` - single-use burn on submit - is added with the submit Bot.)
 */
export type AccessLinkValidation =
  | ({ readonly status: "valid" } & AccessLinkBinding)
  | { readonly status: "expired" }
  | { readonly status: "not-found" };

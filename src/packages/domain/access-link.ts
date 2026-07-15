// The Access-link domain vocabulary (pure, no FHIR). Entry point of the `domain`
// package. An Access link is v1's delivery mechanism: a unique, expiring,
// single-use URL that lets an assigned patient open and complete one Instrument
// without an account (CONTEXT.md). The Access-link module maps these types to a
// project-owned, hashed-token FHIR resource at its seam (ADR-0005); nothing here
// knows about FHIR.

import type { Instrument, InstrumentKey } from "./instrument.js";
import type { ResponseAnswer } from "./workflow.js";

/** What an Access-link token is bound to - resolved when the token is validated. */
export interface AccessLinkBinding {
  /** The Assignment (its `Task` id) this link fulfils. */
  readonly assignmentId: string;
  /** The patient the link is for; a submitted Response is attributed to them. */
  readonly patientId: string;
  /** Canonical URL of the Instrument's `Questionnaire` to render. */
  readonly questionnaireUrl: string;
  /**
   * Stable key of the bound Instrument (mirrors the Assignment's; #17). Lets the
   * submit Bot load the Instrument to re-check completeness server-side (FR-14)
   * and build the Response, without a `questionnaireUrl -> key` lookup.
   */
  readonly instrumentKey: InstrumentKey;
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
 * `used` is a link whose single-use token was already burned on a prior submit
 * (FR-8/FR-11); it is kept distinct from `expired` for audit even though both
 * render the same friendly "no longer available" page.
 */
export type AccessLinkValidation =
  | ({ readonly status: "valid" } & AccessLinkBinding)
  | { readonly status: "expired" }
  | { readonly status: "used" }
  | { readonly status: "not-found" };

/**
 * The outcome of *opening* a link (validate + resolve the Instrument to render).
 * The account-less patient page (#16) drives every render/gate state off this;
 * only a `valid` link yields the blank {@link Instrument} - never any PHI
 * (NFR-5, ADR-0005). The non-valid states mirror {@link AccessLinkValidation}.
 */
export type AccessLinkOpen =
  | { readonly status: "valid"; readonly instrument: Instrument }
  | { readonly status: "expired" }
  | { readonly status: "used" }
  | { readonly status: "not-found" };

/** A patient's presented answers for a submit: the token plus item answers. */
export interface AccessLinkSubmissionInput {
  /** The raw single-use token presented in the Access-link URL. */
  readonly token: string;
  /** The patient's chosen answers, one per Instrument item (FR-13). */
  readonly answers: readonly ResponseAnswer[];
}

/**
 * The outcome of submitting a Response through an Access link. `submitted` is the
 * only success: the token burned and a `QuestionnaireResponse` was created
 * atomically (its {@link responseId} returned for audit/verification). Every
 * other outcome is a refusal with **no** persisted Response:
 * - `not-found` / `expired` - the token never resolved or lapsed (FR-7/FR-11);
 * - `used` - the single-use token was already burned (FR-8; second submit blocked);
 * - `incomplete` - the server-side completeness re-check failed (FR-14, trust
 *   boundary) and carries the still-unanswered item `linkId`s.
 */
export type AccessLinkSubmission =
  | { readonly status: "submitted"; readonly responseId: string }
  | { readonly status: "expired" }
  | { readonly status: "used" }
  | { readonly status: "not-found" }
  | {
      readonly status: "incomplete";
      readonly missingLinkIds: readonly string[];
    };

// The Access-link module: issue a single-use, expiring token for an Assignment,
// validate/open a presented token, and submit (consume) a Response through it.
// Only a hash of the token is ever stored, bound to { Assignment, Patient,
// Questionnaire, Instrument, expiry, audit } (ADR-0005). Depends on Assignment
// (the token binds to an Assignment) and Instrument (to re-check completeness
// server-side and build the Response on submit); the link expiry mirrors the
// Assignment deadline, so the 14-day value has one home (FR-7).
//
// Submit is the sharpest trust boundary in v1 (ADR-0005). Medplum does not roll
// transaction Bundles back on a failed precondition, so single-use is enforced
// by an optimistic-lock **compare-and-swap** on the token (`If-Match` on its
// version), not by transaction atomicity: exactly one concurrent submit can burn
// `issued -> consumed`, the loser is refused. The Response is created only after
// the burn wins; if the create fails the burn is reverted so the link stays
// resumable (FR-8) - the only non-atomic residue is the safe direction (a stuck
// link is reissued, never a double submission).

import { normalizeOperationOutcome, type MedplumClient } from "@medplum/core";
import type { Basic } from "@medplum/fhirtypes";
import type { Assignment } from "../../domain/workflow.js";
import type {
  AccessLinkOpen,
  AccessLinkSubmission,
  AccessLinkSubmissionInput,
  AccessLinkValidation,
  IssuedAccessLink,
} from "../../domain/access-link.js";
import { completeAssignment } from "../../assignment/index.js";
import {
  loadInstrument,
  toQuestionnaireResponse,
} from "../../instrument/index.js";
import {
  fromTokenBasic,
  toConsumedTokenBasic,
  toTokenBasic,
  type TokenRecord,
} from "./basic-codec.js";
import { hashToken, mintToken } from "./token.js";
import {
  BASIC_TYPE_ACCESS_LINK_TOKEN,
  CS_BASIC_TYPE,
  ID_ACCESS_TOKEN_HASH,
} from "./urls.js";

/**
 * Issue an Access link for an Assignment: mint a high-entropy token, persist only
 * its hash bound to { Assignment, Patient, Questionnaire, Instrument, expiry,
 * audit }, and return the raw token exactly once (FR-6, FR-7, ADR-0005). The
 * `now` option sets the issued-at audit stamp; expiry mirrors the Assignment's
 * deadline.
 */
export async function issueAccessLink(
  medplum: MedplumClient,
  assignment: Assignment,
  questionnaireUrl: string,
  opts?: { now?: Date }
): Promise<IssuedAccessLink> {
  const now = opts?.now ?? new Date();
  const { token, hash } = await mintToken();
  const binding = {
    assignmentId: assignment.id,
    patientId: assignment.patientId,
    questionnaireUrl,
    instrumentKey: assignment.instrumentKey,
  };
  const expiresAt = assignment.deadline;
  await medplum.createResource(
    toTokenBasic({
      tokenHash: hash,
      binding,
      expiresAt,
      issuedAt: now.toISOString(),
    })
  );
  return { token, expiresAt, binding };
}

/**
 * Validate a presented raw token: resolve it to its binding if the token exists,
 * is unused, and is unexpired, else the matching domain outcome (`used` /
 * `expired` / `not-found`). Read-only - the single-use burn happens on
 * {@link submitAccessLinkResponse}.
 */
export async function validateAccessLink(
  medplum: MedplumClient,
  rawToken: string,
  opts?: { now?: Date }
): Promise<AccessLinkValidation> {
  const found = await findTokenBasic(medplum, rawToken);
  if (!found) {
    return { status: "not-found" };
  }
  const outcome = statusOf(found.record, opts?.now ?? new Date());
  return outcome === "valid"
    ? { status: "valid", ...found.record.binding }
    : { status: outcome };
}

/**
 * Open a link for completion: validate it and, only if valid, resolve the blank
 * {@link import("../../domain/instrument.js").Instrument} to render - never any
 * PHI (NFR-5, ADR-0005). This is the account-less patient page's read seam
 * (#16); non-valid states pass straight through as friendly outcomes (FR-11).
 */
export async function openAccessLink(
  medplum: MedplumClient,
  rawToken: string,
  opts?: { now?: Date }
): Promise<AccessLinkOpen> {
  const validation = await validateAccessLink(medplum, rawToken, opts);
  if (validation.status !== "valid") {
    return validation;
  }
  const instrument = await loadInstrument(medplum, validation.instrumentKey);
  return { status: "valid", instrument };
}

/**
 * Submit a Response through an Access link: the sharpest trust boundary (ADR-0005).
 * Validates the token, **re-checks completeness against the Instrument's required
 * items before any write** (FR-14 - the client is untrusted), then atomically
 * consumes the token and creates the `QuestionnaireResponse` (subject = bound
 * patient), and marks the Assignment Completed (FR-8/FR-9/FR-13/FR-32). Single-use
 * and race safety come from a compare-and-swap burn; a second or concurrent
 * submit is refused as `used` with no second Response.
 */
export async function submitAccessLinkResponse(
  medplum: MedplumClient,
  input: AccessLinkSubmissionInput,
  opts?: { now?: Date }
): Promise<AccessLinkSubmission> {
  const now = opts?.now ?? new Date();

  const found = await findTokenBasic(medplum, input.token);
  if (!found) {
    return { status: "not-found" };
  }
  const status = statusOf(found.record, now);
  if (status !== "valid") {
    return { status };
  }

  // Trust boundary: the completeness re-check runs server-side against the
  // Instrument's own items, before any write, so a crafted client cannot submit
  // a partial Response (FR-14).
  const { binding } = found.record;
  const instrument = await loadInstrument(medplum, binding.instrumentKey);
  const missingLinkIds = incompleteItems(instrument, input.answers);
  if (missingLinkIds.length > 0) {
    return { status: "incomplete", missingLinkIds };
  }

  // Single-use compare-and-swap: burn issued -> consumed guarded by the read
  // version. A concurrent submit that read the same version loses here (412) and
  // is refused, so the token backs at most one Response.
  let consumed: Basic;
  try {
    consumed = await medplum.updateResource(
      toConsumedTokenBasic(found.basic, now.toISOString()),
      ifMatch(found.basic)
    );
  } catch (err) {
    if (isPreconditionFailed(err)) {
      return { status: "used" }; // lost the race for this single-use token
    }
    throw err;
  }

  // The burn won. Create the Response; if it fails, revert the burn so the link
  // stays resumable (the safe, non-double-submitting direction).
  let responseId: string;
  try {
    const created = await medplum.createResource(
      toQuestionnaireResponse(instrument, {
        patientId: binding.patientId,
        assignmentId: binding.assignmentId,
        answers: input.answers,
        authoredOn: now.toISOString(),
      })
    );
    responseId = created.id;
  } catch (err) {
    await revertBurn(medplum, found.basic, consumed);
    throw err;
  }

  // The Response has landed: the Assignment is Completed. Completion goes through
  // the Assignment module (never an inline Task write; ADR-0009) and is
  // idempotent, so a later re-assertion (e.g. the scoring Bot) is harmless.
  await completeAssignment(medplum, binding.assignmentId);

  return { status: "submitted", responseId };
}

// --- internals --------------------------------------------------------------

/** A resolved token: the raw `Basic` carrier (for CAS) and its decoded record. */
interface FoundToken {
  readonly basic: Basic;
  readonly record: TokenRecord;
}

/** Find a token's `Basic` by the hash of the presented raw token (never the raw). */
async function findTokenBasic(
  medplum: MedplumClient,
  rawToken: string
): Promise<FoundToken | undefined> {
  const tokenHash = await hashToken(rawToken);
  const basic = await medplum.searchOne("Basic", {
    identifier: `${ID_ACCESS_TOKEN_HASH}|${tokenHash}`,
    code: `${CS_BASIC_TYPE}|${BASIC_TYPE_ACCESS_LINK_TOKEN}`,
  });
  return basic ? { basic, record: fromTokenBasic(basic) } : undefined;
}

/** The domain status of a resolved token at `now`: consumed and expiry dominate. */
function statusOf(
  record: TokenRecord,
  now: Date
): "valid" | "used" | "expired" {
  if (record.status === "consumed") {
    return "used";
  }
  if (now.getTime() >= new Date(record.expiresAt).getTime()) {
    return "expired";
  }
  return "valid";
}

/** The `linkId`s of Instrument items with no valid answer in the submission (FR-14). */
function incompleteItems(
  instrument: Awaited<ReturnType<typeof loadInstrument>>,
  answers: AccessLinkSubmissionInput["answers"]
): string[] {
  const answered = new Map(answers.map((a) => [a.linkId, a.answerCode]));
  return instrument.items
    .filter((item) => {
      const code = answered.get(item.linkId);
      return code === undefined || !item.options.some((o) => o.code === code);
    })
    .map((item) => item.linkId);
}

/** An `If-Match` on a resource's current version (optimistic lock; see module note). */
function ifMatch(resource: Basic): { headers: { "If-Match": string } } {
  return { headers: { "If-Match": `W/"${resource.meta?.versionId}"` } };
}

/** Whether an error is a `412 Precondition Failed` (a lost compare-and-swap). */
function isPreconditionFailed(err: unknown): boolean {
  return normalizeOperationOutcome(err).id === "precondition-failed";
}

/** Best-effort revert of a burn (issued -> consumed) after a failed Response create. */
async function revertBurn(
  medplum: MedplumClient,
  issued: Basic,
  consumed: Basic
): Promise<void> {
  await medplum
    .updateResource({ ...issued, meta: consumed.meta }, ifMatch(consumed))
    .catch(() => {
      // The link is left consumed (single-use, safe); a coordinator reissues.
    });
}

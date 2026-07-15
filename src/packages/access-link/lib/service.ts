// The Access-link module: issue a single-use, expiring token for an Assignment
// and validate a presented token. Only a hash of the token is ever stored, bound
// to { Assignment, Patient, Questionnaire, expiry, audit } (ADR-0005). Depends on
// the Assignment domain (the token binds to an Assignment); the link expiry
// mirrors the Assignment deadline, so the 14-day value has one home (FR-7).

import type { MedplumClient } from "@medplum/core";
import type { Assignment } from "../../domain/workflow.js";
import type {
  AccessLinkValidation,
  IssuedAccessLink,
} from "../../domain/access-link.js";
import { fromTokenBasic, toTokenBasic } from "./basic-codec.js";
import { hashToken, mintToken } from "./token.js";
import {
  BASIC_TYPE_ACCESS_LINK_TOKEN,
  CS_BASIC_TYPE,
  ID_ACCESS_TOKEN_HASH,
} from "./urls.js";

/**
 * Issue an Access link for an Assignment: mint a high-entropy token, persist only
 * its hash bound to { Assignment, Patient, Questionnaire, expiry, audit }, and
 * return the raw token exactly once (FR-6, FR-7, ADR-0005). The `now` option sets
 * the issued-at audit stamp; expiry mirrors the Assignment's deadline.
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
 * Validate a presented raw token: resolve it to its binding if the token exists
 * and is unexpired, else the matching domain outcome (`expired` / `not-found`).
 * Read-only - the single-use burn happens on submit (#17).
 */
export async function validateAccessLink(
  medplum: MedplumClient,
  rawToken: string,
  opts?: { now?: Date }
): Promise<AccessLinkValidation> {
  const now = opts?.now ?? new Date();
  const tokenHash = await hashToken(rawToken);
  const basic = await medplum.searchOne("Basic", {
    identifier: `${ID_ACCESS_TOKEN_HASH}|${tokenHash}`,
    code: `${CS_BASIC_TYPE}|${BASIC_TYPE_ACCESS_LINK_TOKEN}`,
  });
  if (!basic) {
    return { status: "not-found" };
  }
  const record = fromTokenBasic(basic);
  if (now.getTime() >= new Date(record.expiresAt).getTime()) {
    return { status: "expired" };
  }
  return { status: "valid", ...record.binding };
}

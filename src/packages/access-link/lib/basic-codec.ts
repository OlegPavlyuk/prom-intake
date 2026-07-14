// Codec between an Access-link token record and its FHIR carrier: a project-owned
// `Basic` keyed by the token's hash (never the raw token; ADR-0005). The binding
// { Assignment, Patient, Questionnaire }, the expiry, and the status live as
// structured extensions; the bound Patient is `Basic.subject` and the issued
// time is `Basic.created` (audit). Private to the Access-link module.

import { resolveId } from "@medplum/core";
import type { Basic, Extension } from "@medplum/fhirtypes";
import type { AccessLinkBinding } from "../../domain/access-link.js";
import {
  BASIC_TYPE_ACCESS_LINK_TOKEN,
  CS_BASIC_TYPE,
  EXT_ACCESS_LINK_ROOT,
  EXT_ASSIGNMENT,
  EXT_EXPIRES_AT,
  EXT_ISSUED_AT,
  EXT_QUESTIONNAIRE_URL,
  EXT_STATUS,
  ID_ACCESS_TOKEN_HASH,
} from "./urls.js";

/** Token lifecycle status. `consumed` (single-use burn) is added with #17. */
export type AccessLinkStatus = "issued";

/** A decoded token record: what it binds, when it expires, its status. */
export interface TokenRecord {
  readonly binding: AccessLinkBinding;
  readonly expiresAt: string;
  readonly status: AccessLinkStatus;
}

/** Build the hashed-token `Basic` for issuance. */
export function toTokenBasic(args: {
  tokenHash: string;
  binding: AccessLinkBinding;
  expiresAt: string;
  issuedAt: string;
}): Basic {
  const payload: Extension[] = [
    {
      url: EXT_ASSIGNMENT,
      valueReference: { reference: `Task/${args.binding.assignmentId}` },
    },
    { url: EXT_QUESTIONNAIRE_URL, valueUri: args.binding.questionnaireUrl },
    { url: EXT_STATUS, valueCode: "issued" },
    { url: EXT_EXPIRES_AT, valueDateTime: args.expiresAt },
    { url: EXT_ISSUED_AT, valueDateTime: args.issuedAt },
  ];
  return {
    resourceType: "Basic",
    identifier: [{ system: ID_ACCESS_TOKEN_HASH, value: args.tokenHash }],
    code: {
      coding: [{ system: CS_BASIC_TYPE, code: BASIC_TYPE_ACCESS_LINK_TOKEN }],
    },
    subject: { reference: `Patient/${args.binding.patientId}` },
    extension: [{ url: EXT_ACCESS_LINK_ROOT, extension: payload }],
  };
}

/** Read a token record back from its `Basic` carrier. */
export function fromTokenBasic(basic: Basic): TokenRecord {
  const root = basic.extension?.find((e) => e.url === EXT_ACCESS_LINK_ROOT);
  const sub = (url: string): Extension | undefined =>
    root?.extension?.find((e) => e.url === url);

  const assignmentId = resolveId(sub(EXT_ASSIGNMENT)?.valueReference);
  const patientId = resolveId(basic.subject);
  const questionnaireUrl = sub(EXT_QUESTIONNAIRE_URL)?.valueUri;
  const expiresAt = sub(EXT_EXPIRES_AT)?.valueDateTime;
  const status = sub(EXT_STATUS)?.valueCode;

  if (
    !assignmentId ||
    !patientId ||
    !questionnaireUrl ||
    !expiresAt ||
    !status
  ) {
    throw new MalformedAccessTokenError(basic.id);
  }

  return {
    binding: { assignmentId, patientId, questionnaireUrl },
    expiresAt,
    status: status as AccessLinkStatus,
  };
}

/** Raised when a token `Basic` cannot be decoded to a token record. */
export class MalformedAccessTokenError extends Error {
  constructor(id: string | undefined) {
    super(`Malformed Access-link token${id ? ` "${id}"` : ""}`);
    this.name = "MalformedAccessTokenError";
  }
}

// The `publicWebhook` submit Bot - the single unauthenticated entry point for the
// account-less patient page (ADR-0005, security.md). It is a **thin adapter**
// (ADR-0009): it unpacks the HTTP event and dispatches to the Access-link
// module's domain functions, holding no business rules of its own. Two
// operations on one Bot (overview.md):
//   - `open`   -> resolve a token to the blank Instrument to render (read-only);
//   - `submit` -> validate + re-check completeness + atomically consume + create
//                 the QuestionnaireResponse + complete the Assignment.
//
// The Bot runs under a narrowly scoped AccessPolicy (see scripts/deploy-bots.ts):
// it can create a QuestionnaireResponse, burn its own token, and complete the
// bound Assignment - and read no PHI. Deployed as a `vmcontext` Bot to the local
// Medplum; see docs/architecture/infrastructure.md.

import type { BotEvent, MedplumClient } from "@medplum/core";
import type {
  AccessLinkOpen,
  AccessLinkSubmission,
} from "../domain/access-link.js";
import type { ResponseAnswer } from "../domain/workflow.js";
import { openAccessLink, submitAccessLinkResponse } from "./lib/service.js";

/** The JSON body the patient page posts to the webhook. */
interface AccessLinkRequest {
  readonly operation: "open" | "submit";
  readonly token: unknown;
  readonly answers?: unknown;
}

/** A refusal the Bot returns for a malformed request (never leaks internals). */
interface BadRequest {
  readonly status: "bad-request";
  readonly message: string;
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<unknown>
): Promise<AccessLinkOpen | AccessLinkSubmission | BadRequest> {
  const request = parseRequest(event.input);
  if ("status" in request) {
    return request; // bad-request
  }

  if (request.operation === "open") {
    return openAccessLink(medplum, request.token);
  }
  return submitAccessLinkResponse(medplum, {
    token: request.token,
    answers: request.answers,
  });
}

/** Parse + validate the webhook body into a typed request, or a bad-request. */
function parseRequest(
  input: unknown
):
  | (AccessLinkRequest & { token: string; answers: ResponseAnswer[] })
  | BadRequest {
  const body: unknown = typeof input === "string" ? safeJson(input) : input;
  if (typeof body !== "object" || body === null) {
    return { status: "bad-request", message: "Expected a JSON object body." };
  }
  const { operation, token, answers } = body as AccessLinkRequest;
  if (operation !== "open" && operation !== "submit") {
    return { status: "bad-request", message: "Unknown operation." };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { status: "bad-request", message: "Missing token." };
  }
  return { operation, token, answers: parseAnswers(answers) };
}

/** Coerce the answers array to `ResponseAnswer[]`, dropping anything malformed. */
function parseAnswers(answers: unknown): ResponseAnswer[] {
  if (!Array.isArray(answers)) {
    return [];
  }
  return answers.flatMap((a): ResponseAnswer[] => {
    const linkId = (a as { linkId?: unknown })?.linkId;
    const answerCode = (a as { answerCode?: unknown })?.answerCode;
    return typeof linkId === "string" && typeof answerCode === "string"
      ? [{ linkId, answerCode }]
      : [];
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// The account-less patient app's one server touchpoint: the Access-link
// `publicWebhook` Bot (ADR-0005, security.md). The patient client is
// unauthenticated and credential-free (ADR-0010 A3), so it cannot call the
// Access-link module directly; instead it POSTs to the single public webhook,
// which runs the same domain functions server-side under a narrow AccessPolicy.
// One Bot, two operations (overview.md):
//   - `open`   -> resolve the token to the blank Instrument to render;
//   - `submit` -> validate + re-check completeness + atomically consume.
//
// These functions are injectable so the UI-seam tests drive every render/gate/
// submit state without a real network call. The webhook URL is a non-secret
// build/runtime var written by `npm run medplum:deploy-bots` (see
// docs/architecture/infrastructure.md); production points it at the deployed Bot.

import type {
  AccessLinkOpen,
  AccessLinkSubmission,
  AccessLinkSubmissionInput,
} from "../../../../packages/domain/access-link.js";

/** The outcome of resolving a presented Access-link token for the open step. */
export type AccessLinkOpenResult = AccessLinkOpen;

export type ResolvePatientAccessLink = (
  token: string
) => Promise<AccessLinkOpenResult>;

export type SubmitPatientResponse = (
  input: AccessLinkSubmissionInput
) => Promise<AccessLinkSubmission>;

/** POST a JSON body to the Access-link webhook and return its parsed result. */
async function callWebhook<T>(body: unknown): Promise<T> {
  const url = import.meta.env.VITE_ACCESS_LINK_WEBHOOK_URL;
  if (!url) {
    throw new Error("VITE_ACCESS_LINK_WEBHOOK_URL is not configured");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Access-link webhook returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const resolvePatientAccessLink: ResolvePatientAccessLink = (token) =>
  callWebhook<AccessLinkOpenResult>({ operation: "open", token });

export const submitPatientResponse: SubmitPatientResponse = (input) =>
  callWebhook<AccessLinkSubmission>({ operation: "submit", ...input });

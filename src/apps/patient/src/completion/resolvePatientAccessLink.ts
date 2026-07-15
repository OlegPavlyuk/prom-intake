// The account-less "open" seam (FR-13, ADR-0005): resolve a raw Access-link
// token to the blank Instrument to render - no patient or clinical data
// (NFR-5, PHI-minimal). Kept as a small, injectable function so the UI-seam
// tests drive every render/gate/Crisis Response state without a real network
// call; production binds it to the real resolution mechanism.
//
// TODO(#17): the patient client is unauthenticated and credential-free
// (ADR-0010 A3), so this cannot call `validateAccessLink`/`loadInstrument`
// directly - both take an authenticated `MedplumClient`. Architecture
// (ADR-0005, overview.md) names the `publicWebhook` Bot as the single
// unauthenticated entry point, serving both token validation and submit, but
// that Bot does not exist yet - only its submit half is scoped to #17, and
// there is no Bot-deploy infrastructure in this repo at all yet. Building that
// was out of scope for this client-side ticket (see the #16 issue comment for
// the full analysis and a recommendation to widen #17's scope). Until the Bot
// exists and this is wired to call it, every token resolves as "not-found" -
// the same friendly page a truly invalid link gets, never an error or a blank
// form.

import type { Instrument } from "../../../../packages/domain/instrument.js";

/** The outcome of resolving a presented Access-link token for the open step. */
export type AccessLinkOpenResult =
  | { readonly status: "valid"; readonly instrument: Instrument }
  | { readonly status: "expired" }
  | { readonly status: "not-found" };

export type ResolvePatientAccessLink = (
  token: string
) => Promise<AccessLinkOpenResult>;

export const resolvePatientAccessLink: ResolvePatientAccessLink = async () => {
  return { status: "not-found" };
};

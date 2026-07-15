// The Coordinator app is the delivery layer (ADR-0010): `issueAccessLink` returns
// a raw single-use token, not a URL, so this app assembles the patient-facing
// Access-link URL from that token and the Patient-app base URL. Keeping the URL
// shape here - not in the Access-link module - lets a future SMS/email/portal
// channel deliver the same token without touching the module (module-boundaries).

/**
 * Assemble the patient-facing Access-link URL from the Patient-app base and a raw
 * token: `<base>?token=<token>`. Built through the URL API so a base with or
 * without a trailing slash, or with an existing path, resolves correctly and the
 * token is percent-encoded. The patient app (#16) reads the `token` query param.
 */
export function buildAccessLinkUrl(
  patientAppBaseUrl: string,
  token: string
): string {
  const url = new URL(patientAppBaseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

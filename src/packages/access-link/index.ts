// Entry point (public surface) of the Access-link module: issue a single-use,
// expiring token for an Assignment and validate a presented token. The link is
// v1's delivery mechanism (CONTEXT.md); this module owns the project-owned,
// **hashed** token resource - only a hash of the token is ever stored, never the
// raw token (ADR-0005). All FHIR/crypto detail is hidden here; callers speak
// Access links and bindings (module-boundaries).
//
// Scope: `issue` a token, `validate`/`open` it read-only, and `submit` a Response
// through it - the single-use consume-on-submit burn, compare-and-swap atomic
// with QuestionnaireResponse creation and Assignment completion (#17, ADR-0005).
// The `publicWebhook` Bot (./bot.js) is a thin adapter over these functions.
//
// Domain types (`IssuedAccessLink`, `AccessLinkValidation`, `AccessLinkOpen`,
// `AccessLinkSubmission`, ...) live in the `domain` package and are imported
// from there directly.
export {
  issueAccessLink,
  validateAccessLink,
  openAccessLink,
  submitAccessLinkResponse,
} from "./lib/service.js";

// Entry point (public surface) of the Access-link module: issue a single-use,
// expiring token for an Assignment and validate a presented token. The link is
// v1's delivery mechanism (CONTEXT.md); this module owns the project-owned,
// **hashed** token resource - only a hash of the token is ever stored, never the
// raw token (ADR-0005). All FHIR/crypto detail is hidden here; callers speak
// Access links and bindings (module-boundaries).
//
// Scope: `issue` + read-only `validate`. The single-use `consume`-on-submit burn
// (atomic with QuestionnaireResponse creation) lands with the submit Bot (#17).
//
// Domain types (`IssuedAccessLink`, `AccessLinkValidation`, ...) live in the
// `domain` package and are imported from there directly.
export { issueAccessLink, validateAccessLink } from "./lib/service.js";

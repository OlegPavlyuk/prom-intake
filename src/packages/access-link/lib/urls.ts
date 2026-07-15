// Canonical URLs and coding coordinates for the Access-link token resource.
// Project-wide identifiers come from the `terminology` package (one source of
// truth); the identifiers below are Access-link-specific and stay private to
// this module. The token is carried as a project-owned `Basic` (FHIR's resource
// for a project concept it does not otherwise model), hashed per ADR-0005.

import { PROJECT_BASE } from "../../terminology/systems.js";

export { CS_BASIC_TYPE } from "../../terminology/systems.js";

/** `Basic.code` code marking a resource as an Access-link token. */
export const BASIC_TYPE_ACCESS_LINK_TOKEN = "access-link-token";
/** Identifier system holding the token's SHA-256 hash (never the raw token). */
export const ID_ACCESS_TOKEN_HASH = `${PROJECT_BASE}/access-token-hash`;

// --- token-record extension URLs (structured payload on the Basic) ----------
export const EXT_ACCESS_LINK_ROOT = `${PROJECT_BASE}/StructureDefinition/access-link-token`;
export const EXT_ASSIGNMENT = "assignment";
export const EXT_QUESTIONNAIRE_URL = "questionnaireUrl";
export const EXT_INSTRUMENT_KEY = "instrumentKey";
export const EXT_STATUS = "status";
export const EXT_EXPIRES_AT = "expiresAt";
export const EXT_ISSUED_AT = "issuedAt";
/** Audit stamp: when the single-use token was burned on submit (ADR-0005). */
export const EXT_SUBMITTED_AT = "submittedAt";

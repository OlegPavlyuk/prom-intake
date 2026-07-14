// The project-owned FHIR terminology: canonical URLs and coding systems that are
// shared reference data across modules (Instrument, Assignment, Access-link,
// Worklist). This is the ONE place these identifiers live - modules import them
// from here rather than re-declaring, so a system URL has a single source of
// truth (P8). Module-specific URLs (an Instrument's config extensions, the
// Access-link token's extensions) stay private to their own module.
//
// `.example` is an IETF-reserved TLD: these are stable project identifiers, not
// a routable domain.

/** Base for every project-owned canonical URL. */
export const PROJECT_BASE = "https://prom-intake.example/fhir";

// --- Project-owned CodeSystems (ADR-0003) -----------------------------------
/** `Task.code` discriminator: `assignment` | `flag`. */
export const CS_TASK_CODE = `${PROJECT_BASE}/CodeSystem/task-code`;
/** Flag `businessStatus`: `Open` | `Acknowledged` | `Resolved`. */
export const CS_FLAG_STATUS = `${PROJECT_BASE}/CodeSystem/flag-status`;
/** Assignment `businessStatus`: `Pending` | `Completed` | `Expired`. */
export const CS_ASSIGNMENT_STATUS = `${PROJECT_BASE}/CodeSystem/assignment-status`;
/** Resolution reason enum (FR-28). */
export const CS_RESOLUTION_REASON = `${PROJECT_BASE}/CodeSystem/resolution-reason`;

/** `Task.code` value discriminating an Assignment `Task` (ADR-0001/0003). */
export const TASK_CODE_ASSIGNMENT = "assignment";
/** `Task.code` value discriminating a Flag `Task` (ADR-0002/0003). */
export const TASK_CODE_FLAG = "flag";

// --- Shared identifier + carrier systems ------------------------------------
/**
 * `Basic.code` system marking a project-owned `Basic` carrier's concrete type
 * (e.g. `instrument-config`, `access-link-token`). Shared because more than one
 * module carries a project concept as a `Basic`.
 */
export const CS_BASIC_TYPE = `${PROJECT_BASE}/CodeSystem/basic-type`;
/**
 * Identifier system carrying an Instrument's stable key. It appears on the
 * InstrumentConfig `Basic` and its `Questionnaire` (Instrument module) and on an
 * Assignment `Task` (Assignment module) to record which Instrument was assigned.
 */
export const ID_INSTRUMENT_KEY = `${PROJECT_BASE}/instrument-key`;

// --- Standard external systems ----------------------------------------------
/** LOINC. */
export const LOINC = "http://loinc.org";

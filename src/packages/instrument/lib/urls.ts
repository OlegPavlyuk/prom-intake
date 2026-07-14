// Project-owned canonical URLs and coding systems. Private to the Instrument
// module (this is the one place FHIR identifiers live). `.example` is an
// IETF-reserved TLD, signalling these are stable project identifiers, not a
// routable domain.

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

// --- InstrumentConfig carrier (a `Basic` resource) --------------------------
/** `Basic.code` system marking a resource as an InstrumentConfig. */
export const CS_BASIC_TYPE = `${PROJECT_BASE}/CodeSystem/basic-type`;
/** `Basic.code` code for an InstrumentConfig. */
export const BASIC_TYPE_INSTRUMENT_CONFIG = "instrument-config";
/** Identifier system carrying an Instrument's stable key, on both the Basic and the Questionnaire. */
export const ID_INSTRUMENT_KEY = `${PROJECT_BASE}/instrument-key`;

// --- InstrumentConfig extension URLs (structured payload on the Basic) -------
export const EXT_CONFIG_ROOT = `${PROJECT_BASE}/StructureDefinition/instrument-config`;
export const EXT_QUESTIONNAIRE_URL = "questionnaireUrl";
export const EXT_TITLE = "title";
export const EXT_TOTAL_SCORE = "totalScore";
export const EXT_PANEL_CODE = "panelCode";
export const EXT_ACUTE_RISK_ITEM = "acuteRiskItemLinkId";
export const EXT_SEVERITY_BAND = "severityBand";
export const EXT_BAND_CODE = "code";
export const EXT_BAND_LABEL = "label";
export const EXT_BAND_MIN = "minScore";
export const EXT_BAND_MAX = "maxScore";
export const EXT_TRIGGER = "trigger";
export const EXT_TRIGGER_KIND = "kind";
export const EXT_TRIGGER_CODE = "code";
export const EXT_TRIGGER_LABEL = "label";
export const EXT_TRIGGER_PRIORITY = "priority";
export const EXT_TRIGGER_AT_OR_ABOVE_SCORE = "atOrAboveScore";
export const EXT_TRIGGER_LINK_ID = "linkId";
export const EXT_TRIGGER_AT_OR_ABOVE_VALUE = "atOrAboveValue";
export const EXT_TRIGGER_ACUTE_RISK = "acuteRisk";

// --- Standard external systems ----------------------------------------------
/** SDC per-answer scoring weight; the Instrument module reads and sums it (ADR-0004). */
export const EXT_ITEM_WEIGHT =
  "http://hl7.org/fhir/StructureDefinition/itemWeight";
/** Answer-option coding system for an Instrument's ordinal options. */
export const answerOptionSystem = (key: string): string =>
  `${PROJECT_BASE}/CodeSystem/${key}-answer`;
export const LOINC = "http://loinc.org";

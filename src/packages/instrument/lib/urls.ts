// Canonical URLs and coding systems used by the Instrument module. The project-
// wide, shared identifiers come from the `terminology` package (one source of
// truth; P8) and are re-exported here so the module's internals keep importing
// them from one local hub. The identifiers below are Instrument-specific (the
// InstrumentConfig `Basic` type + its structured-extension payload, the SDC
// weight, the answer-option systems) and stay private to this module.

export {
  PROJECT_BASE,
  CS_BASIC_TYPE,
  ID_INSTRUMENT_KEY,
  LOINC,
} from "../../terminology/systems.js";

import { PROJECT_BASE } from "../../terminology/systems.js";

// --- InstrumentConfig carrier (a `Basic` resource) --------------------------
/** `Basic.code` code for an InstrumentConfig. */
export const BASIC_TYPE_INSTRUMENT_CONFIG = "instrument-config";

// --- InstrumentConfig extension URLs (structured payload on the Basic) -------
export const EXT_CONFIG_ROOT = `${PROJECT_BASE}/StructureDefinition/instrument-config`;
export const EXT_QUESTIONNAIRE_URL = "questionnaireUrl";
export const EXT_TITLE = "title";
export const EXT_TOTAL_SCORE = "totalScore";
export const EXT_PANEL_CODE = "panelCode";
export const EXT_ACUTE_RISK_ITEM = "acuteRiskItemLinkId";
export const EXT_CRISIS_RESPONSE = "crisisResponse";
export const EXT_CRISIS_MESSAGE = "message";
export const EXT_CRISIS_PHONE = "phone";
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

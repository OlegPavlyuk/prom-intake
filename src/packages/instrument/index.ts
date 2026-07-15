// Entry point (public surface) of the Instrument module: load a fully-resolved
// Instrument by its key. All FHIR mapping (`Questionnaire` + SDC `itemWeight`,
// the InstrumentConfig `Basic`, the project CodeSystems) is hidden behind this
// domain interface - callers speak Instruments, never FHIR (module-boundaries).
//
// Domain types (`Instrument`, `TriggerDefinition`, ...) live in the `domain`
// package and are imported from there directly.
export {
  loadInstrument,
  loadInstrumentByQuestionnaireUrl,
  InstrumentNotFoundError,
} from "./lib/loader.js";

// Encode a loaded Instrument back to its FHIR `Questionnaire` shape. Callers
// that already hold a resolved Instrument (rather than an authenticated
// `MedplumClient` to fetch the persisted resource) use this to get something
// `@medplum/react`'s `QuestionnaireForm` can render - e.g. the patient
// completion page (#16), which is unauthenticated and cannot search Medplum
// directly (ADR-0010 A3).
export {
  toQuestionnaire,
  toQuestionnaireResponse,
} from "./lib/questionnaire-codec.js";

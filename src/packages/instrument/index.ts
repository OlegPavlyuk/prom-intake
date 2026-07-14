// Entry point (public surface) of the Instrument module: load a fully-resolved
// Instrument by its key. All FHIR mapping (`Questionnaire` + SDC `itemWeight`,
// the InstrumentConfig `Basic`, the project CodeSystems) is hidden behind this
// domain interface - callers speak Instruments, never FHIR (module-boundaries).
//
// Domain types (`Instrument`, `TriggerDefinition`, ...) live in the `domain`
// package and are imported from there directly.
export { loadInstrument, InstrumentNotFoundError } from "./lib/loader.js";

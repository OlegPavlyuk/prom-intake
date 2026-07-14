// Shared coding vocabulary (pure, no FHIR). Entry point of the `domain` package.
//
// A `LoincCoding` names a LOINC concept by its code plus a human display. It is
// deliberately not a FHIR `Coding` - the domain speaks in plain concepts and the
// Instrument module maps to/from FHIR at its seam (CONTEXT.md, module-boundaries).

export interface LoincCoding {
  /** LOINC code, e.g. `44261-6` (PHQ-9 total score). */
  readonly code: string;
  /** Human-readable display for the code. */
  readonly display: string;
}

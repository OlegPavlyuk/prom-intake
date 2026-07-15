// The Scoring engine's `ObservationEmitter` output adapter: translate a pure
// `ScoreObservation` (the kernel's FHIR-free Score model) into a FHIR
// `Observation` (ADR-0004, module-boundaries). v1 emits one total-score
// Observation (LOINC total, `derivedFrom` the Response); panel/item-level
// Observations are an additive change behind this same seam (data-model).
// Private to the Scoring module.

import type { Observation } from "@medplum/fhirtypes";
import type { ScoreObservation } from "../../domain/scoring.js";
import { LOINC } from "../../terminology/systems.js";

/**
 * Build the FHIR `Observation` for a computed Score: a `final`, quantitative
 * total keyed by its LOINC coding, `subject` the patient, `derivedFrom` the
 * Response, and `effectiveDateTime` the submission time (KPI-computable; NFR-1).
 */
export function toScoreObservation(
  score: ScoreObservation,
  opts: { effectiveDateTime: string }
): Observation {
  return {
    resourceType: "Observation",
    status: "final",
    code: {
      coding: [
        { system: LOINC, code: score.code.code, display: score.code.display },
      ],
    },
    subject: { reference: `Patient/${score.patientId}` },
    derivedFrom: [
      {
        reference: `QuestionnaireResponse/${score.derivedFromResponseId}`,
      },
    ],
    effectiveDateTime: opts.effectiveDateTime,
    valueInteger: score.value,
  };
}

/** The search that uniquely identifies a Score Observation by `derivedFrom` + `code`. */
export function scoreObservationQuery(score: ScoreObservation): string {
  return (
    `derived-from=QuestionnaireResponse/${score.derivedFromResponseId}` +
    `&code=${LOINC}|${score.code.code}`
  );
}

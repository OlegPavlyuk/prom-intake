// The scoring / trigger engine (pure, no FHIR, no I/O). Entry point of the
// `domain` package. `score(response, instrument)` sums the chosen answers'
// SDC `itemWeight` into a total, evaluates the Instrument's Triggers, and returns
// the Score, the Score Observation(s) to persist, and the Flags to raise - with
// **no instrument-specific code** (ADR-0004): PHQ-9 and any future GAD-7 are pure
// configuration, so adding an Instrument never changes this engine (FR-4, NFR-2).
//
// This is the shared kernel the Scoring Bot (a thin adapter) will call and then
// persist the results of - it contains no Subscription/Bot wiring, no idempotent
// creates, and no `Task`/`Observation` construction (ADR-0009). The raised Flag
// here is the Flag *domain object* (Open, `authoredOn`, trigger refs), not the
// Flag `Task`; only the Flag module maps it to FHIR (ADR-0002).

import type { LoincCoding } from "./coding.js";
import type {
  FlagPriority,
  Instrument,
  TriggerDefinition,
} from "./instrument.js";
import { bandForScore, weightFor } from "./instrument-queries.js";
import type { Response, Score } from "./workflow.js";

/**
 * A Score expressed as an Observation to persist: the Instrument's LOINC total
 * coding, the total value, the patient it is about, and the Response it was
 * derived from (`derivedFrom`). The Scoring Bot maps this to a FHIR `Observation`
 * (LOINC `44261-6`) - the model here is FHIR-free (data-model). v1 emits only the
 * total; panel/item-level Observations are an additive change behind this emitter.
 */
export interface ScoreObservation {
  /** LOINC coding of the total Score, read from the Instrument config. */
  readonly code: LoincCoding;
  /** The computed total Score. */
  readonly value: number;
  /** The patient the Score is about (Observation `subject`). */
  readonly patientId: string;
  /** Reference of the Response (`QuestionnaireResponse`) this Score derives from. */
  readonly derivedFromResponseId: string;
}

/**
 * A Flag at the moment a Trigger raises it, before persistence assigns it an id
 * (CONTEXT.md). It is always Open, authored as of the Response submission, and
 * records which Trigger(s) raised it (FR-22). The Flag module maps this to a Flag
 * `Task` (ADR-0002); the persisted `Flag` (with its id/owner/resolution) is the
 * Worklist module's concern.
 */
export interface RaisedFlag {
  /** The patient the Flag is about. */
  readonly patientId: string;
  /** A freshly-raised Flag is always Open. */
  readonly status: "Open";
  /** Priority tier the raising Trigger confers (drives Worklist ordering). */
  readonly priority: FlagPriority;
  /** Codes of the Trigger(s) that raised the Flag (FR-22). */
  readonly triggerCodes: readonly string[];
  /** ISO-8601 time the Flag was raised (`authoredOn`). */
  readonly createdAt: string;
}

/**
 * What scoring a Response yields: the numeric Score, the Observation(s) to
 * persist (always at least the total, FR-32), and the Flags to raise (one per
 * fired Trigger; v1 does no dedup/linking).
 */
export interface ScoringResult {
  readonly score: Score;
  readonly observations: readonly ScoreObservation[];
  readonly flags: readonly RaisedFlag[];
}

/**
 * Score a submitted Response against its Instrument's configuration and evaluate
 * the Instrument's Triggers (ADR-0004). Pure and deterministic - the sole seam
 * for FR-3/FR-18/FR-19/FR-20/FR-21/FR-22, driven entirely by config so it stays
 * instrument-agnostic (FR-4, NFR-2).
 */
export function score(
  response: Response,
  instrument: Instrument
): ScoringResult {
  const total = totalScore(response, instrument);
  const scoreResult: Score = {
    instrumentKey: instrument.key,
    total,
    bandCode: bandForScore(instrument, total)?.code,
  };

  const flags = instrument.triggers
    .filter((trigger) => triggerFires(trigger, response, instrument, total))
    .map((trigger) => raiseFlag(trigger, response));

  return {
    score: scoreResult,
    observations: emitScoreObservations(instrument, total, response),
    flags,
  };
}

/** Sum the chosen options' scoring weights; unknown items/options contribute 0. */
function totalScore(response: Response, instrument: Instrument): number {
  return response.answers.reduce(
    (sum, answer) =>
      sum + (weightFor(instrument, answer.linkId, answer.answerCode) ?? 0),
    0
  );
}

/** Whether a Trigger's condition is met by this Response / total (FR-18/19/20). */
function triggerFires(
  trigger: TriggerDefinition,
  response: Response,
  instrument: Instrument,
  total: number
): boolean {
  switch (trigger.kind) {
    case "severity-band":
      // FR-18: fires when the total Score reaches the configured cutoff.
      return total >= trigger.atOrAboveScore;
    case "critical-item": {
      // FR-19/20: fires on one item's answer weight, independent of the total.
      const answer = response.answers.find((a) => a.linkId === trigger.linkId);
      if (answer === undefined) {
        return false;
      }
      const weight = weightFor(instrument, trigger.linkId, answer.answerCode);
      return weight !== undefined && weight >= trigger.atOrAboveValue;
    }
  }
}

/**
 * The ObservationEmitter: translate the scoring result into the Observation(s) to
 * persist. v1 emits a single total-score Observation; this is the additive seam
 * for future panel/item-level Observations (data-model), so it returns an array.
 */
function emitScoreObservations(
  instrument: Instrument,
  total: number,
  response: Response
): readonly ScoreObservation[] {
  return [
    {
      code: instrument.totalScore,
      value: total,
      patientId: response.patientId,
      derivedFromResponseId: response.id,
    },
  ];
}

/**
 * The Flag-construction function: build the Open Flag domain object a fired
 * Trigger raises. Authored as of the Response submission (the instant the risk
 * entered the system), so `authoredOn` is deterministic and KPI-computable
 * (NFR-1). Records the raising Trigger's code (FR-22).
 */
function raiseFlag(trigger: TriggerDefinition, response: Response): RaisedFlag {
  return {
    patientId: response.patientId,
    status: "Open",
    priority: trigger.priority,
    triggerCodes: [trigger.code],
    createdAt: response.submittedAt,
  };
}

// The Scoring engine's server-side adapter (ADR-0004/0009). It composes the
// existing pieces - load the Instrument's config, run the pure `score` kernel,
// emit the Score Observation(s), raise the Response's Flag - and persists the
// results idempotently. It holds NO business rules of its own: scoring math and
// Trigger evaluation live in the pure `score` kernel; the Flag `Task` is built
// only by the Worklist module (never inline here). This is the function the
// Subscription-fired Bot calls; the Bot itself is a thin event unpacker.
//
// Idempotency (Subscriptions deliver at-least-once): every write is a conditional
// create keyed on the Response - the Observation on `derivedFrom` + LOINC code,
// the Flag on its (Response, fired trigger codes) key - so a redelivered event
// resolves to the existing resources instead of double-writing (event-flows). A
// Response yields at most one Flag, carrying every fired reason (ADR-0011).

import { resolveId, type MedplumClient } from "@medplum/core";
import type { QuestionnaireResponse } from "@medplum/fhirtypes";
import { score } from "../../domain/scoring.js";
import type {
  Flag,
  Response,
  ResponseAnswer,
  Score,
} from "../../domain/workflow.js";
import { loadInstrumentByQuestionnaireUrl } from "../../instrument/index.js";
import { completeAssignment } from "../../assignment/index.js";
import { raiseFlag } from "../../worklist/index.js";
import { LOINC } from "../../terminology/systems.js";
import {
  scoreObservationQuery,
  toScoreObservation,
} from "./observation-codec.js";

/** A persisted Score Observation, as a domain-level result (no FHIR shape). */
export interface PersistedScore {
  /** Id of the persisted `Observation`. */
  readonly id: string;
  /** LOINC code of the Score (e.g. `44261-6`). */
  readonly code: string;
  /** The computed value. */
  readonly value: number;
}

/**
 * What scoring + persisting a Response yields: the numeric Score, the persisted
 * Score Observation(s) (always at least the total; FR-32), and the Flag raised -
 * at most one per Response, carrying every fired Trigger's reason (FR-21/22;
 * ADR-0011), so `flags` holds zero or one entry.
 */
export interface ScoringOutcome {
  readonly score: Score;
  readonly observations: readonly PersistedScore[];
  readonly flags: readonly Flag[];
}

/**
 * Score a submitted Response and persist the results. Always writes the Score
 * Observation (FR-32); conditionally raises the Response's single Flag (all fired
 * reasons; ADR-0011); and re-asserts Assignment completion idempotently
 * (ADR-0009). Idempotent under redelivery. Instrument-agnostic - the Instrument
 * is resolved from the Response's `Questionnaire`, and all scoring/Trigger logic
 * is pure config (ADR-0004): a new Instrument never changes this adapter.
 */
export async function scoreResponse(
  medplum: MedplumClient,
  response: QuestionnaireResponse
): Promise<ScoringOutcome> {
  const instrument = await loadInstrumentByQuestionnaireUrl(
    medplum,
    requireQuestionnaireUrl(response)
  );
  const domainResponse = toDomainResponse(response, instrument.key);
  const result = score(domainResponse, instrument);

  // Always persist the Score Observation(s), regardless of flagging (FR-32).
  const observations: PersistedScore[] = [];
  for (const scoreObs of result.observations) {
    const persisted = await medplum.createResourceIfNoneExist(
      toScoreObservation(scoreObs, {
        effectiveDateTime: domainResponse.submittedAt,
      }),
      scoreObservationQuery(scoreObs)
    );
    observations.push({
      id: persisted.id!,
      code: scoreObs.code.code,
      value: scoreObs.value,
    });
  }

  // The Score Observation is the clinical signal a Flag focuses on.
  const observationRef =
    observations.length > 0 ? `Observation/${observations[0]!.id}` : undefined;

  // Raise the Response's Flag (one, carrying every fired reason; ADR-0011) via
  // the Worklist module (never inline). `result.flags` holds zero or one entry.
  const flags: Flag[] = [];
  for (const raised of result.flags) {
    flags.push(
      await raiseFlag(medplum, raised, {
        responseId: response.id!,
        ...(observationRef ? { observationRef } : {}),
      })
    );
  }

  // Follow-on bookkeeping: re-assert Assignment completion idempotently via the
  // Assignment module (never an inline Task write; ADR-0009). The submit path
  // completes the Assignment on the fast path (#17); this is the recovery the
  // Access-link module relies on if that best-effort completion did not land.
  // It never fails scoring - the persisted Score + Flags are the Bot's contract,
  // and completion is idempotent so redelivery re-asserts a no-op.
  const assignmentId = assignmentIdFrom(response);
  if (assignmentId) {
    await completeAssignment(medplum, assignmentId).catch(() => {
      // Left as-is; the Score/Flags never depend on the Assignment flipping.
    });
  }

  return { score: result.score, observations, flags };
}

// --- internals --------------------------------------------------------------

/**
 * The Assignment id the Response fulfils (`QuestionnaireResponse.basedOn` -> the
 * assignment `Task`; questionnaire-codec), or `undefined` for a Response not tied
 * to an Assignment - in which case there is nothing to complete.
 */
function assignmentIdFrom(response: QuestionnaireResponse): string | undefined {
  const ref = (response.basedOn ?? []).find((r) =>
    r.reference?.startsWith("Task/")
  );
  return ref ? resolveId(ref) : undefined;
}

/** The Response's `Questionnaire` canonical URL, or a descriptive failure. */
function requireQuestionnaireUrl(response: QuestionnaireResponse): string {
  if (!response.questionnaire) {
    throw new UnscorableResponseError(
      response.id,
      "no `questionnaire` reference"
    );
  }
  return response.questionnaire;
}

/**
 * Map the FHIR `QuestionnaireResponse` to the pure-domain Response the scoring
 * kernel consumes: the answered option `code` per `linkId` (mirroring how the
 * Response was written; questionnaire-codec), the subject patient, and the
 * submission time.
 */
function toDomainResponse(
  response: QuestionnaireResponse,
  instrumentKey: string
): Response {
  const patientId = resolveId(response.subject);
  if (!response.id || !patientId) {
    throw new UnscorableResponseError(
      response.id,
      "missing id or subject Patient"
    );
  }
  return {
    id: response.id,
    instrumentKey,
    patientId,
    answers: answersOf(response),
    submittedAt: response.authored ?? new Date().toISOString(),
  };
}

/**
 * The chosen option `code` per answered `linkId`, mirroring how the Response was
 * written (questionnaire-codec). The single source of truth for item answers is
 * the `QuestionnaireResponse` (overview); this recovers the domain answers the
 * scoring kernel and the Flag detail both read.
 */
function answersOf(response: QuestionnaireResponse): ResponseAnswer[] {
  return (response.item ?? []).flatMap((item) => {
    const answerCode = item.answer?.[0]?.valueCoding?.code;
    return item.linkId && answerCode
      ? [{ linkId: item.linkId, answerCode }]
      : [];
  });
}

/** A persisted Response read back for display (the Flag detail's FR-29 signal). */
export interface SubmittedResponse {
  /** Id of the `QuestionnaireResponse`. */
  readonly id: string;
  /** The patient the Response is about. */
  readonly patientId: string;
  /** Canonical URL of the Instrument's `Questionnaire`, to resolve its config. */
  readonly questionnaireUrl: string;
  /** ISO-8601 submission time. */
  readonly submittedAt: string;
  /** The chosen option `code` per answered `linkId`. */
  readonly answers: readonly ResponseAnswer[];
}

/**
 * Read a persisted Response (its item answers + submission time) by id. The
 * Scoring module owns turning a `QuestionnaireResponse` into domain facts, so the
 * Flag detail reads answers through this entry point rather than touching the
 * resource inline (module-boundaries). Callers get domain answers, never FHIR.
 */
export async function getResponse(
  medplum: MedplumClient,
  responseId: string
): Promise<SubmittedResponse> {
  const qr = await medplum.readResource("QuestionnaireResponse", responseId);
  const patientId = resolveId(qr.subject);
  if (!qr.id || !patientId || !qr.questionnaire) {
    throw new UnscorableResponseError(
      qr.id,
      "missing id, subject Patient, or questionnaire"
    );
  }
  return {
    id: qr.id,
    patientId,
    questionnaireUrl: qr.questionnaire,
    submittedAt: qr.authored ?? "",
    answers: answersOf(qr),
  };
}

/**
 * Read the persisted total Score of a Response, or `undefined` when none exists.
 * The Scoring module owns the Score `Observation` (module-boundaries), so the
 * Flag detail reads it through this entry point. v1 writes a single total-score
 * Observation per Response (`derivedFrom` the Response; ADR-0004), so the lookup
 * resolves to at most one.
 */
export async function getScore(
  medplum: MedplumClient,
  responseId: string
): Promise<PersistedScore | undefined> {
  const [observation] = await medplum.searchResources("Observation", {
    "derived-from": `QuestionnaireResponse/${responseId}`,
    code: `${LOINC}|`,
    _count: "1",
  });
  if (!observation?.id) {
    return undefined;
  }
  return {
    id: observation.id,
    code: observation.code?.coding?.[0]?.code ?? "",
    value: observation.valueInteger ?? 0,
  };
}

/** Raised when a `QuestionnaireResponse` cannot be scored (malformed event). */
export class UnscorableResponseError extends Error {
  constructor(id: string | undefined, detail: string) {
    super(`Unscorable QuestionnaireResponse${id ? ` "${id}"` : ""}: ${detail}`);
    this.name = "UnscorableResponseError";
  }
}

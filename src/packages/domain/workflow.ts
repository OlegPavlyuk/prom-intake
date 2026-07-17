// The coordinator-workflow domain vocabulary (pure, no FHIR). Entry point of the
// `domain` package. These types are the shared lifecycle terms - matching the
// project-owned CodeSystems seeded by the Instrument module - that the later
// vertical slices (Assignment, submit/score/flag, Worklist) build on.
//
// They are intentionally minimal: this ticket establishes the shared vocabulary
// the pure kernels reuse; each downstream module fleshes out its own behaviour.

import type { InstrumentKey, FlagPriority } from "./instrument.js";

/** Assignment lifecycle (CONTEXT.md); code system `assignment-status`. */
export type AssignmentStatus = "Pending" | "Completed" | "Expired";

/** Flag lifecycle (CONTEXT.md); code system `flag-status`. */
export type FlagStatus = "Open" | "Acknowledged" | "Resolved";

/**
 * The predefined reason a coordinator selects when resolving a Flag (FR-28);
 * code system `resolution-reason`. `other` requires a free-text note.
 */
export type ResolutionReason =
  | "contacted-patient"
  | "follow-up-scheduled"
  | "referred-to-clinician"
  | "escalated"
  | "no-action-needed"
  | "duplicate-invalid"
  | "other";

/**
 * The structured reason a coordinator records when resolving a Flag (FR-28): a
 * predefined `ResolutionReason` plus an optional free-text note. A note is
 * mandatory when the reason is `other` (enforced by the Worklist service).
 */
export interface Resolution {
  readonly reason: ResolutionReason;
  readonly note?: string;
}

/** One patient's answer to one item within a Response. */
export interface ResponseAnswer {
  readonly linkId: string;
  /** Chosen `AnswerOption.code`. */
  readonly answerCode: string;
}

/** One patient's completed answers to one Instrument at one time (CONTEXT.md). */
export interface Response {
  /**
   * Reference of the persisted Response (the `QuestionnaireResponse`). A Response
   * is scored only after it has been submitted and persisted, so it always has an
   * identity; the Score Observation records it as `derivedFrom` (data-model).
   */
  readonly id: string;
  readonly instrumentKey: InstrumentKey;
  readonly patientId: string;
  readonly answers: readonly ResponseAnswer[];
  /** ISO-8601 submission time. */
  readonly submittedAt: string;
}

/** The numeric result of scoring a Response, with its interpretation band. */
export interface Score {
  readonly instrumentKey: InstrumentKey;
  readonly total: number;
  /** Severity band the total falls in, if the Instrument defines bands. */
  readonly bandCode?: string;
}

/**
 * A coordinator's delivery of an Instrument to a patient (CONTEXT.md). Persisted
 * downstream as a `Task` (`code=assignment`; ADR-0001/0003) by the Assignment
 * module.
 */
export interface Assignment {
  readonly id: string;
  readonly patientId: string;
  readonly instrumentKey: InstrumentKey;
  readonly status: AssignmentStatus;
  /** ISO-8601 deadline (14 days in v1). */
  readonly deadline: string;
}

/**
 * A work item raised when a Trigger fires on a Response (CONTEXT.md). Persisted
 * downstream as a `Task` (`code=flag`; ADR-0002/0003) by the Worklist module;
 * ordered by `PriorityPolicy` (FR-24/25).
 */
export interface Flag {
  readonly id: string;
  readonly patientId: string;
  readonly status: FlagStatus;
  readonly priority: FlagPriority;
  /** Codes of the Trigger(s) that raised the Flag (FR-22). */
  readonly triggerCodes: readonly string[];
  /** ISO-8601 time the Flag was raised (Open). */
  readonly createdAt: string;
  /** ISO-8601 time a coordinator claimed the Flag (Acknowledged). */
  readonly acknowledgedAt?: string;
  /** ISO-8601 time the Flag was resolved. */
  readonly resolvedAt?: string;
  /** Owning coordinator once Acknowledged. */
  readonly owner?: string;
  /** Structured reason recorded on resolution (FR-28). */
  readonly resolution?: Resolution;
}

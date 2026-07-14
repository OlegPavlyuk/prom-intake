// The Assignment module: create / complete / expire / query Assignments, mapping
// the domain concept to a FHIR `Task` (`code=assignment`) behind this interface
// (ADR-0001/0003). Only this module reads or writes the assignment `Task`.

import {
  isNotFound,
  normalizeOperationOutcome,
  type MedplumClient,
} from "@medplum/core";
import type { Task } from "@medplum/fhirtypes";
import type { Assignment, AssignmentStatus } from "../../domain/workflow.js";
import type { InstrumentKey } from "../../domain/instrument.js";
import {
  CS_TASK_CODE,
  TASK_CODE_ASSIGNMENT,
} from "../../terminology/systems.js";
import {
  fromAssignmentTask,
  isAssignmentTask,
  statusFields,
  statusToFhir,
  toAssignmentTask,
} from "./task-codec.js";

/** The 14-day Assignment deadline (FR-7), held as one config value. */
export const ASSIGNMENT_TTL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The coded search filter selecting only assignment `Task`s. */
const ASSIGNMENT_TASK_FILTER = `${CS_TASK_CODE}|${TASK_CODE_ASSIGNMENT}`;

/** What a caller supplies to create an Assignment. */
export interface NewAssignment {
  readonly patientId: string;
  readonly instrumentKey: InstrumentKey;
  /** Literal reference to the Instrument's `Questionnaire`, e.g. `Questionnaire/abc`. */
  readonly questionnaireRef: string;
}

/**
 * Create a Pending Assignment of an Instrument to a patient with a 14-day
 * deadline (FR-5, FR-7, FR-9). Reissue (FR-10) is simply calling this again: each
 * call is an independent Assignment.
 */
export async function createAssignment(
  medplum: MedplumClient,
  newAssignment: NewAssignment,
  opts?: { now?: Date }
): Promise<Assignment> {
  const now = opts?.now ?? new Date();
  const deadline = new Date(now.getTime() + ASSIGNMENT_TTL_DAYS * DAY_MS);
  const task = await medplum.createResource(
    toAssignmentTask({
      patientId: newAssignment.patientId,
      instrumentKey: newAssignment.instrumentKey,
      questionnaireRef: newAssignment.questionnaireRef,
      status: "Pending",
      deadline: deadline.toISOString(),
      authoredOn: now.toISOString(),
    })
  );
  return fromAssignmentTask(task);
}

/** Mark an Assignment Completed (invoked by the submit Bot once a Response lands). */
export function completeAssignment(
  medplum: MedplumClient,
  assignmentId: string
): Promise<Assignment> {
  return transition(medplum, assignmentId, "Completed");
}

/** Mark an Assignment Expired (its link lapsed unused). */
export function expireAssignment(
  medplum: MedplumClient,
  assignmentId: string
): Promise<Assignment> {
  return transition(medplum, assignmentId, "Expired");
}

/** Load one Assignment by id. */
export async function getAssignment(
  medplum: MedplumClient,
  assignmentId: string
): Promise<Assignment> {
  return fromAssignmentTask(await readAssignmentTask(medplum, assignmentId));
}

/** List a patient's Assignments, optionally filtered to one lifecycle status. */
export async function findAssignmentsByPatient(
  medplum: MedplumClient,
  patientId: string,
  opts?: { status?: AssignmentStatus }
): Promise<Assignment[]> {
  const query: Record<string, string> = {
    code: ASSIGNMENT_TASK_FILTER,
    patient: `Patient/${patientId}`,
  };
  if (opts?.status) {
    query.status = statusToFhir(opts.status);
  }
  const tasks = await medplum.searchResources("Task", query);
  return tasks.map(fromAssignmentTask);
}

// --- internals --------------------------------------------------------------

/**
 * Read the assignment `Task` for an id, or raise {@link AssignmentNotFoundError}.
 * A `Task` that exists but is not an Assignment (e.g. a Flag) is treated as not
 * found - this module owns only assignment Tasks.
 */
async function readAssignmentTask(
  medplum: MedplumClient,
  assignmentId: string
): Promise<Task> {
  let task: Task;
  try {
    task = await medplum.readResource("Task", assignmentId);
  } catch (err) {
    if (isNotFound(normalizeOperationOutcome(err))) {
      throw new AssignmentNotFoundError(assignmentId);
    }
    throw err;
  }
  if (!isAssignmentTask(task)) {
    throw new AssignmentNotFoundError(assignmentId);
  }
  return task;
}

async function transition(
  medplum: MedplumClient,
  assignmentId: string,
  to: AssignmentStatus
): Promise<Assignment> {
  const task = await readAssignmentTask(medplum, assignmentId);
  const from = fromAssignmentTask(task).status;
  if (from === to) {
    return fromAssignmentTask(task); // idempotent
  }
  if (from !== "Pending") {
    throw new IllegalAssignmentTransitionError(from, to);
  }
  const updated = await medplum.updateResource({
    ...task,
    ...statusFields(to),
  });
  return fromAssignmentTask(updated);
}

/** Raised when no Assignment exists for a given id. */
export class AssignmentNotFoundError extends Error {
  constructor(assignmentId: string) {
    super(`Assignment "${assignmentId}" not found`);
    this.name = "AssignmentNotFoundError";
  }
}

/** Raised when a lifecycle transition is not legal from the current status. */
export class IllegalAssignmentTransitionError extends Error {
  constructor(from: AssignmentStatus, to: AssignmentStatus) {
    super(`Illegal Assignment transition: ${from} -> ${to}`);
    this.name = "IllegalAssignmentTransitionError";
  }
}

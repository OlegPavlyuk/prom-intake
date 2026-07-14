// Codec between the domain Assignment and its FHIR carrier: a `Task`
// (`code=assignment`; ADR-0001/0003). The lifecycle Pending/Completed/Expired
// lives in `businessStatus` (project `assignment-status` CodeSystem) and drives a
// coherent standard FHIR `status` underneath, so Medplum's Task tooling keeps
// working. Private to the Assignment module - nothing outside touches the `Task`.

import { resolveId } from "@medplum/core";
import type { Task } from "@medplum/fhirtypes";
import type { Assignment, AssignmentStatus } from "../../domain/workflow.js";
import {
  CS_ASSIGNMENT_STATUS,
  CS_TASK_CODE,
  ID_INSTRUMENT_KEY,
  TASK_CODE_ASSIGNMENT,
} from "../../terminology/systems.js";

// Domain lifecycle -> standard FHIR Task.status (ADR-0003 pattern). Pending is a
// request awaiting fulfilment; Expired is a lapsed request that will not be done.
const STATUS_TO_FHIR: Record<AssignmentStatus, Task["status"]> = {
  Pending: "requested",
  Completed: "completed",
  Expired: "cancelled",
};

/** The standard FHIR `Task.status` that shadows a domain Assignment status. */
export function statusToFhir(status: AssignmentStatus): Task["status"] {
  return STATUS_TO_FHIR[status];
}

/** Whether a `Task` is an Assignment (vs. a Flag or unrelated Task). */
export function isAssignmentTask(task: Task): boolean {
  return (task.code?.coding ?? []).some(
    (c) => c.system === CS_TASK_CODE && c.code === TASK_CODE_ASSIGNMENT
  );
}

/** The `businessStatus`/`status` pair for a given domain lifecycle state. */
export function statusFields(
  status: AssignmentStatus
): Pick<Task, "status" | "businessStatus"> {
  return {
    status: statusToFhir(status),
    businessStatus: {
      coding: [{ system: CS_ASSIGNMENT_STATUS, code: status }],
    },
  };
}

/** Build a new Assignment `Task`. */
export function toAssignmentTask(args: {
  patientId: string;
  instrumentKey: string;
  questionnaireRef: string;
  status: AssignmentStatus;
  deadline: string;
  authoredOn: string;
}): Task {
  return {
    resourceType: "Task",
    intent: "order",
    ...statusFields(args.status),
    code: {
      coding: [{ system: CS_TASK_CODE, code: TASK_CODE_ASSIGNMENT }],
    },
    identifier: [{ system: ID_INSTRUMENT_KEY, value: args.instrumentKey }],
    for: { reference: `Patient/${args.patientId}` },
    focus: { reference: args.questionnaireRef },
    authoredOn: args.authoredOn,
    restriction: { period: { end: args.deadline } },
  };
}

/** Read a domain Assignment back from its `Task` carrier. */
export function fromAssignmentTask(task: Task): Assignment {
  const patientId = resolveId(task.for);
  const instrumentKey = task.identifier?.find(
    (i) => i.system === ID_INSTRUMENT_KEY
  )?.value;
  const status = task.businessStatus?.coding?.find(
    (c) => c.system === CS_ASSIGNMENT_STATUS
  )?.code as AssignmentStatus | undefined;
  const deadline = task.restriction?.period?.end;

  if (!task.id || !patientId || !instrumentKey || !status || !deadline) {
    throw new MalformedAssignmentError(task.id);
  }

  return { id: task.id, patientId, instrumentKey, status, deadline };
}

/** Raised when an assignment `Task` is missing fields the domain requires. */
export class MalformedAssignmentError extends Error {
  constructor(id: string | undefined) {
    super(`Malformed Assignment Task${id ? ` "${id}"` : ""}`);
    this.name = "MalformedAssignmentError";
  }
}

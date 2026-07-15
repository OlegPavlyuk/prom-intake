// Codec between the domain Flag and its FHIR carrier: a `Task` (`code=flag`;
// ADR-0002/0003). Only the Worklist (Flag) module constructs or reads a Flag
// `Task` - including when a Bot raises one, which calls this module's function
// rather than building the `Task` inline (ADR-0009). The lifecycle
// Open/Acknowledged/Resolved lives in `businessStatus` (project `flag-status`
// CodeSystem) shadowing a coherent standard `Task.status`, mirroring the
// Assignment codec (ADR-0003). Private to the Worklist module.

import { resolveId } from "@medplum/core";
import type { Task } from "@medplum/fhirtypes";
import type { Flag, FlagStatus } from "../../domain/workflow.js";
import type { FlagPriority } from "../../domain/instrument.js";
import type { RaisedFlag } from "../../domain/scoring.js";
import {
  CS_FLAG_STATUS,
  CS_TASK_CODE,
  ID_FLAG_DEDUP_KEY,
  SYS_TRIGGER_CODE,
  TASK_CODE_FLAG,
} from "./urls.js";

// Domain lifecycle -> standard FHIR Task.status (ADR-0003 pattern): Open is a
// ready work item, Acknowledged is being worked, Resolved is done.
const STATUS_TO_FHIR: Record<FlagStatus, Task["status"]> = {
  Open: "ready",
  Acknowledged: "in-progress",
  Resolved: "completed",
};

// Domain priority tier <-> standard FHIR Task.priority, a faithful bijection so
// the tier round-trips (the Worklist's PriorityPolicy ranks on the domain tier).
const PRIORITY_TO_FHIR: Record<FlagPriority, Task["priority"]> = {
  "acute-risk": "stat",
  urgent: "urgent",
  routine: "routine",
};
const PRIORITY_FROM_FHIR: Record<string, FlagPriority> = {
  stat: "acute-risk",
  urgent: "urgent",
  routine: "routine",
};

/** The idempotency key binding a Flag to its (Response, Trigger) origin. */
export function flagDedupKey(
  responseId: string,
  triggerCodes: readonly string[]
): string {
  return `${responseId}:${[...triggerCodes].sort().join(",")}`;
}

/** Whether a `Task` is a Flag (vs. an Assignment or unrelated Task). */
export function isFlagTask(task: Task): boolean {
  return (task.code?.coding ?? []).some(
    (c) => c.system === CS_TASK_CODE && c.code === TASK_CODE_FLAG
  );
}

/** The `businessStatus`/`status` pair for a given Flag lifecycle state. */
export function statusFields(
  status: FlagStatus
): Pick<Task, "status" | "businessStatus"> {
  return {
    status: STATUS_TO_FHIR[status],
    businessStatus: { coding: [{ system: CS_FLAG_STATUS, code: status }] },
  };
}

/**
 * Build a freshly-Open Flag `Task` for a Trigger that fired on a Response. Its
 * `for` is the patient, `focus` the Score `Observation`, `basedOn` the Response
 * it was raised from, `reasonCode` records the raising Trigger(s) (FR-22), and
 * `authoredOn` is the Response submission time (KPI-computable; NFR-1). Carries
 * the (Response, Trigger) idempotency key so a redelivered event never
 * duplicates it (event-flows).
 */
export function toFlagTask(
  flag: RaisedFlag,
  refs: { responseId: string; observationRef?: string }
): Task {
  return {
    resourceType: "Task",
    intent: "order",
    ...statusFields(flag.status),
    priority: PRIORITY_TO_FHIR[flag.priority],
    code: { coding: [{ system: CS_TASK_CODE, code: TASK_CODE_FLAG }] },
    identifier: [
      {
        system: ID_FLAG_DEDUP_KEY,
        value: flagDedupKey(refs.responseId, flag.triggerCodes),
      },
    ],
    for: { reference: `Patient/${flag.patientId}` },
    ...(refs.observationRef
      ? { focus: { reference: refs.observationRef } }
      : {}),
    basedOn: [{ reference: `QuestionnaireResponse/${refs.responseId}` }],
    // `Task.reasonCode` is a single CodeableConcept (R4); the Trigger(s) that
    // raised this Flag are its codings (FR-22).
    reasonCode: {
      coding: flag.triggerCodes.map((code) => ({
        system: SYS_TRIGGER_CODE,
        code,
      })),
    },
    authoredOn: flag.createdAt,
  };
}

/** Read a domain Flag back from its `Task` carrier. */
export function fromFlagTask(task: Task): Flag {
  const patientId = resolveId(task.for);
  const status = task.businessStatus?.coding?.find(
    (c) => c.system === CS_FLAG_STATUS
  )?.code as FlagStatus | undefined;
  const createdAt = task.authoredOn;

  if (!task.id || !patientId || !status || !createdAt) {
    throw new MalformedFlagError(task.id);
  }

  const triggerCodes = (task.reasonCode?.coding ?? [])
    .filter((c) => c.system === SYS_TRIGGER_CODE && c.code)
    .map((c) => c.code!);
  const owner = task.owner ? resolveId(task.owner) : undefined;

  return {
    id: task.id,
    patientId,
    status,
    priority: PRIORITY_FROM_FHIR[task.priority ?? "routine"] ?? "routine",
    triggerCodes,
    createdAt,
    ...(task.executionPeriod?.start
      ? { acknowledgedAt: task.executionPeriod.start }
      : {}),
    ...(task.executionPeriod?.end
      ? { resolvedAt: task.executionPeriod.end }
      : {}),
    ...(owner ? { owner } : {}),
  };
}

/** Raised when a Flag `Task` is missing fields the domain requires. */
export class MalformedFlagError extends Error {
  constructor(id: string | undefined) {
    super(`Malformed Flag Task${id ? ` "${id}"` : ""}`);
    this.name = "MalformedFlagError";
  }
}

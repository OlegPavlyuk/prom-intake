// The Worklist (Flag) module service. It owns the Flag `Task` (`code=flag`) end
// to end, mapping the domain Flag to and from FHIR behind this interface - callers
// speak Flags, never `Task`s. Flag creation ({@link raiseFlag}) is called by the
// Scoring Bot (ADR-0002/0009); {@link listWorklist} and {@link getFlag} are the
// read side that the coordinator Worklist and Flag detail consume (#21).
// Acknowledge and resolve are later slices (#22/#23).

import type { MedplumClient } from "@medplum/core";
import { PriorityPolicy } from "../../domain/priority.js";
import type { Flag } from "../../domain/workflow.js";
import type { RaisedFlag } from "../../domain/scoring.js";
import {
  flagDedupKey,
  flagOrigin,
  fromFlagTask,
  isFlagTask,
  toFlagTask,
  type FlagOriginRefs,
} from "./task-codec.js";
import { CS_TASK_CODE, ID_FLAG_DEDUP_KEY, TASK_CODE_FLAG } from "./urls.js";

/** References tying a raised Flag to the Response/Score that produced it. */
export interface FlagOrigin {
  /** Id of the `QuestionnaireResponse` the Flag was raised from. */
  readonly responseId: string;
  /** Reference of the Score `Observation` the Flag focuses on, if written. */
  readonly observationRef?: string;
}

/**
 * Raise a Flag for a fired Trigger, idempotently. The Flag is keyed on its
 * (Response, Trigger) origin, so a redelivered Subscription event resolves to
 * the existing Flag instead of creating a duplicate (event-flows; at-least-once
 * delivery, ADR-0004). Returns the persisted domain Flag.
 */
export async function raiseFlag(
  medplum: MedplumClient,
  flag: RaisedFlag,
  origin: FlagOrigin
): Promise<Flag> {
  const key = flagDedupKey(origin.responseId, flag.triggerCodes);
  const task = await medplum.createResourceIfNoneExist(
    toFlagTask(flag, {
      responseId: origin.responseId,
      ...(origin.observationRef
        ? { observationRef: origin.observationRef }
        : {}),
    }),
    `identifier=${ID_FLAG_DEDUP_KEY}|${key}`
  );
  return fromFlagTask(task);
}

/**
 * The shared Worklist for the organization (FR-23): the unresolved Flags - both
 * Open and Acknowledged - ordered by delegating to {@link PriorityPolicy.order}
 * (FR-24/25/26; ADR-0007). Ordering is not re-implemented here - the service
 * loads and the policy ranks (SRP). Resolved Flags are off the active Worklist:
 * they map to `Task.status = completed`, so the query excludes them
 * (`status:not=completed`; ADR-0003). Only this module reads the Flag `Task`.
 */
export async function listWorklist(medplum: MedplumClient): Promise<Flag[]> {
  const tasks = await medplum.searchResources("Task", {
    code: `${CS_TASK_CODE}|${TASK_CODE_FLAG}`,
    "status:not": "completed",
    _count: "1000",
  });
  return PriorityPolicy.order(tasks.map(fromFlagTask));
}

/** A persisted Flag together with the Response/Score origin the detail composes from. */
export interface FlagRecord extends FlagOriginRefs {
  /** The domain Flag (lifecycle state, priority, owner, timestamps). */
  readonly flag: Flag;
}

/**
 * Read a single Flag by id, with the origin references (the Response it was
 * raised from, the Score it focuses on) the Flag detail needs to compose the
 * FR-29 clinical signal. Only this module reads the Flag `Task`; callers get a
 * domain Flag plus plain references, never a `Task`.
 */
export async function getFlag(
  medplum: MedplumClient,
  flagId: string
): Promise<FlagRecord> {
  const task = await medplum.readResource("Task", flagId);
  if (!isFlagTask(task)) {
    throw new NotAFlagError(flagId);
  }
  return { flag: fromFlagTask(task), ...flagOrigin(task) };
}

/** Raised when a `Task` id does not identify a Flag (`code=flag`). */
export class NotAFlagError extends Error {
  constructor(id: string) {
    super(`Task "${id}" is not a Flag`);
    this.name = "NotAFlagError";
  }
}

// The Worklist (Flag) module service. It owns the Flag `Task` (`code=flag`) end
// to end, mapping the domain Flag to and from FHIR behind this interface - callers
// speak Flags, never `Task`s. Flag creation ({@link raiseFlag}) is called by the
// Scoring Bot (ADR-0002/0009); {@link listWorklist} and {@link getFlag} are the
// read side that the coordinator Worklist and Flag detail consume (#21).
// Acknowledge and resolve are later slices (#22/#23).

import { normalizeOperationOutcome, type MedplumClient } from "@medplum/core";
import type {
  Practitioner,
  Provenance,
  Reference,
  Task,
} from "@medplum/fhirtypes";
import { PriorityPolicy } from "../../domain/priority.js";
import type { Flag } from "../../domain/workflow.js";
import type { RaisedFlag } from "../../domain/scoring.js";
import {
  flagDedupKey,
  flagOrigin,
  flagOwnerId,
  flagStatusOf,
  fromFlagTask,
  isFlagTask,
  toAcknowledgedTask,
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

/**
 * The outcome of a coordinator Acknowledging (claiming) a Flag - a domain result,
 * never a raw `412` or a `Task` shape (ADR-0006). Either the claim won (the now
 * Acknowledged Flag, with its single owner), or the Flag was already claimed (the
 * current owner, so the UI can say "already claimed by <name>").
 */
export type AcknowledgeOutcome =
  | { readonly outcome: "acknowledged"; readonly flag: Flag }
  | { readonly outcome: "already-claimed"; readonly owner?: string };

/**
 * Acknowledge (claim) an Open Flag for a coordinator, single-owner, under
 * optimistic concurrency (ADR-0006). The Flag transitions Open->Acknowledged
 * (`businessStatus`; shadow `status` ready->in-progress, ADR-0003), gains the
 * `owner`, and records the claim time in `executionPeriod.start` (KPI-computable
 * time-to-acknowledge; data-model). A `Provenance` records the actor + timestamp
 * (NFR-6).
 *
 * Concurrency: the claim is a compare-and-swap guarded by `If-Match` on the read
 * version. Two coordinators racing the same Open Flag both read one version; the
 * server accepts exactly one write and rejects the other with `412`, which this
 * seam translates to `already-claimed` carrying the current owner - so a Flag
 * never gets two owners and no HTTP status reaches callers. A Flag already past
 * Open is likewise refused (a later, non-racing claim), guarding the case where a
 * second coordinator reads the already-Acknowledged version.
 *
 * `coordinator` is the acknowledging coordinator's reference (e.g.
 * `Practitioner/{id}`); only this module writes the Flag `Task`.
 */
export async function acknowledge(
  medplum: MedplumClient,
  flagId: string,
  coordinator: string,
  opts?: { now?: Date }
): Promise<AcknowledgeOutcome> {
  const now = opts?.now ?? new Date();
  const owner: Reference<Practitioner> = { reference: coordinator };

  const task = await medplum.readResource("Task", flagId);
  if (!isFlagTask(task)) {
    throw new NotAFlagError(flagId);
  }
  // Only an Open Flag can be claimed. One already Acknowledged (or otherwise past
  // Open) is owned - refuse and report the current owner, so a claim that read
  // the already-claimed version cannot overwrite the owner (the `If-Match` guard
  // alone only stops a same-version race).
  if (flagStatusOf(task) !== "Open") {
    return { outcome: "already-claimed", ...ownerOf(task) };
  }

  let claimed: Task;
  try {
    claimed = await medplum.updateResource(
      toAcknowledgedTask(task, owner, now.toISOString()),
      ifMatch(task)
    );
  } catch (err) {
    if (isPreconditionFailed(err)) {
      // Lost a same-version race: another coordinator claimed it first. Re-read
      // to report who now owns it (FlagAlreadyClaimed; ADR-0006).
      const current = await medplum.readResource("Task", flagId);
      return { outcome: "already-claimed", ...ownerOf(current) };
    }
    throw err;
  }

  // The claim won: record the transition as a Provenance (actor + timestamp) so
  // "who claimed it, when" is answerable by query without version archaeology
  // (NFR-1/NFR-6).
  await medplum.createResource<Provenance>({
    resourceType: "Provenance",
    target: [{ reference: `Task/${flagId}` }],
    recorded: now.toISOString(),
    agent: [{ who: owner }],
  });

  return { outcome: "acknowledged", flag: fromFlagTask(claimed) };
}

/** The current owner of a Flag `Task` as an `already-claimed` payload. */
function ownerOf(task: Task): { owner?: string } {
  const owner = flagOwnerId(task);
  return owner ? { owner } : {};
}

/** An `If-Match` on a resource's current version (optimistic lock; ADR-0006). */
function ifMatch(resource: Task): { headers: { "If-Match": string } } {
  return { headers: { "If-Match": `W/"${resource.meta?.versionId}"` } };
}

/** Whether an error is a `412 Precondition Failed` (a lost compare-and-swap). */
function isPreconditionFailed(err: unknown): boolean {
  return normalizeOperationOutcome(err).id === "precondition-failed";
}

/** Raised when a `Task` id does not identify a Flag (`code=flag`). */
export class NotAFlagError extends Error {
  constructor(id: string) {
    super(`Task "${id}" is not a Flag`);
    this.name = "NotAFlagError";
  }
}

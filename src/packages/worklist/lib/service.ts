// The Worklist (Flag) module service. In this slice it owns Flag creation: the
// Scoring Bot raises a Flag per fired Trigger by calling {@link raiseFlag}, never
// by building a `Task` inline (ADR-0002/0009). Listing, acknowledge, and resolve
// are later slices (#20/#21+); only the Flag-construction seam lands here.

import type { MedplumClient } from "@medplum/core";
import type { Flag } from "../../domain/workflow.js";
import type { RaisedFlag } from "../../domain/scoring.js";
import { flagDedupKey, fromFlagTask, toFlagTask } from "./task-codec.js";
import { ID_FLAG_DEDUP_KEY } from "./urls.js";

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

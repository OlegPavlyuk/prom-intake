// The Scoring Bot - fired by a Medplum Subscription on `QuestionnaireResponse`
// creation (ADR-0004, event-flows). It is a **thin adapter** (ADR-0009): it
// unpacks the FHIR event and dispatches to the Scoring module's `scoreResponse`,
// holding no business rules of its own (scoring math + Trigger evaluation are
// the pure `score` kernel; the Flag `Task` is built only by the Worklist
// module). Subscriptions deliver at-least-once, so `scoreResponse` is idempotent
// and re-firing this Bot never double-writes.
//
// Deployed as a `vmcontext` Bot to the local Medplum alongside its Subscription;
// see scripts/deploy-bots.ts and docs/architecture/infrastructure.md.

import type { BotEvent, MedplumClient } from "@medplum/core";
import type { QuestionnaireResponse } from "@medplum/fhirtypes";
import { scoreResponse, type ScoringOutcome } from "./index.js";

/** A no-op result when the event is not a scorable QuestionnaireResponse. */
interface Ignored {
  readonly status: "ignored";
  readonly reason: string;
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<QuestionnaireResponse>
): Promise<ScoringOutcome | Ignored> {
  const response = event.input;
  if (
    !response ||
    typeof response !== "object" ||
    response.resourceType !== "QuestionnaireResponse"
  ) {
    return { status: "ignored", reason: "not a QuestionnaireResponse event" };
  }
  return scoreResponse(medplum, response);
}

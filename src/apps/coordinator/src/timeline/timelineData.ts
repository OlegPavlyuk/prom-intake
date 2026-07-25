// The patient-timeline orchestration: the Coordinator app wiring that turns the
// modules owning a patient's assessment data into the read-only history the
// timeline screen renders (FR-33). It composes the deep modules through their
// entry points (module-boundaries) - the app sits at the top of the graph and
// passes the authenticated `useMedplum()` client in (ADR-0010). No FHIR resource
// shapes leak into the UI: the screen calls this and gets back domain rows.
//
// A timeline row joins data that already exists (FR-32 persisted every Response +
// Score, flagged or not): the Response + its submission time (Scoring module), the
// total Score + severity band (Scoring + Instrument config), and the Response's
// Flag status if any (Worklist module). Nothing here reads `QuestionnaireResponse`
// / `Observation` / `Task` inline - each is read through its owning module. The
// composition, like the Flag detail's, lives in the app because no single module
// owns the join (module-boundaries). It is exercised end-to-end against a real
// Medplum in `timelineData.integration.test.ts`; at the UI seam it is injected so
// the jsdom tests never re-run the backend modules.

import type { MedplumClient } from "@medplum/core";
import type { FlagStatus } from "../../../../packages/domain/workflow.js";
import { bandForScore } from "../../../../packages/domain/instrument-queries.js";
import { loadInstrumentByQuestionnaireUrl } from "../../../../packages/instrument/index.js";
import {
  findResponsesByPatient,
  getScore,
} from "../../../../packages/scoring/index.js";
import { findFlagsByPatient } from "../../../../packages/worklist/index.js";

/**
 * One completed Response in a patient's assessment history (FR-33): the
 * Instrument, when it was submitted, its total Score + severity band, and the
 * status of the Flag it raised - or `undefined` for a Response that raised none
 * (the FR-32 low-score / no-Trigger case, now visible).
 */
export interface TimelineRow {
  /** Id of the `QuestionnaireResponse`, the row's stable key. */
  readonly responseId: string;
  readonly instrumentTitle: string;
  /** ISO-8601 submission time. */
  readonly submittedAt: string;
  readonly total: number;
  /** Severity band the total falls in, if the Instrument defines one. */
  readonly band?: { readonly code: string; readonly label: string };
  /** The Response's Flag status, or `undefined` when it raised no Flag. */
  readonly flagStatus?: FlagStatus;
}

/**
 * A patient's assessment history, newest first (FR-33): every completed Response,
 * each with its Instrument, submission time, total Score + severity band, and Flag
 * status (none / Open / Acknowledged / Resolved). Read-only - it composes the
 * already-persisted FR-32 data, adding no write path and no analytics.
 *
 * Reverse-chronological order comes from the Scoring read (`findResponsesByPatient`);
 * this preserves it. Each Response's Flag is matched by the Response it was raised
 * from (a Response yields at most one Flag; ADR-0011). The distinct Instruments are
 * resolved once each (v1 is all PHQ-9), so a long history is not one config load
 * per row.
 */
export async function loadPatientTimeline(
  medplum: MedplumClient,
  patientId: string
): Promise<TimelineRow[]> {
  const [responses, flags] = await Promise.all([
    findResponsesByPatient(medplum, patientId),
    findFlagsByPatient(medplum, patientId),
  ]);

  // A Response has at most one Flag (ADR-0011); index Flag status by the Response
  // it was raised from so each row can show its status without an extra query.
  const statusByResponse = new Map<string, FlagStatus>(
    flags.map(({ flag, responseId }) => [responseId, flag.status])
  );

  // Resolve each distinct Instrument once, not per Response.
  const instruments = new Map<
    string,
    Awaited<ReturnType<typeof loadInstrumentByQuestionnaireUrl>>
  >();
  await Promise.all(
    [...new Set(responses.map((r) => r.questionnaireUrl))].map(async (url) => {
      instruments.set(
        url,
        await loadInstrumentByQuestionnaireUrl(medplum, url)
      );
    })
  );

  return Promise.all(
    responses.map(async (response) => {
      const instrument = instruments.get(response.questionnaireUrl)!;
      const score = await getScore(medplum, response.id);
      const total = score?.value ?? 0;
      const band = bandForScore(instrument, total);
      const flagStatus = statusByResponse.get(response.id);
      return {
        responseId: response.id,
        instrumentTitle: instrument.title,
        submittedAt: response.submittedAt,
        total,
        ...(band ? { band: { code: band.code, label: band.label } } : {}),
        ...(flagStatus ? { flagStatus } : {}),
      };
    })
  );
}

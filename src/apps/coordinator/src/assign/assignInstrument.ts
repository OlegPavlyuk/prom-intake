// The assign orchestration: the Coordinator app wiring that turns "assign PHQ-9 to
// this patient" into a persisted Assignment and a deliverable Access link. It
// composes the deep modules through their entry points (module-boundaries) and
// assembles the patient-facing URL from the raw token - the app is the delivery
// layer (ADR-0010). No FHIR resource shapes leak into the UI: the screen calls
// this and gets back a domain result.
//
// This is validated end-to-end against a real Medplum in `/verify` (loadInstrument
// needs a seeded Instrument; ADR-0008). At the UI seam it is injected as a
// dependency, so the jsdom/MockClient tests never re-exercise the backend modules.

import type { MedplumClient } from "@medplum/core";
import type { InstrumentKey } from "../../../../packages/domain/instrument.js";
import { loadInstrument } from "../../../../packages/instrument/index.js";
import { createAssignment } from "../../../../packages/assignment/index.js";
import { issueAccessLink } from "../../../../packages/access-link/index.js";
import { buildAccessLinkUrl } from "./accessLinkUrl.js";

/** The Instrument this screen assigns (PHQ-9 is the first shipped Instrument). */
export const ASSIGNED_INSTRUMENT_KEY: InstrumentKey = "phq-9";

/** The domain outcome of assigning, ready for the screen to display once. */
export interface AssignmentResult {
  /** The patient-facing Access-link URL to deliver out-of-band (shown once). */
  readonly accessLinkUrl: string;
  /** ISO-8601 link/Assignment expiry (14 days; FR-7). */
  readonly expiresAt: string;
  /** The assigned Instrument's human title (config-driven, not hard-coded). */
  readonly instrumentTitle: string;
}

/**
 * Assign the Instrument to a patient and mint a deliverable Access link (FR-5,
 * FR-6). Each call is an independent Assignment + link, so reissue (FR-10) is
 * simply calling this again - there is no separate resend.
 *
 * The `createAssignment` interface takes a *literal* `Questionnaire/{id}`
 * reference, while `loadInstrument` yields the canonical URL; resolving one to
 * the other is this delivery-layer's job (there is no Questionnaire module).
 */
export async function assignInstrument(
  medplum: MedplumClient,
  params: { patientId: string; patientAppBaseUrl: string }
): Promise<AssignmentResult> {
  const instrument = await loadInstrument(medplum, ASSIGNED_INSTRUMENT_KEY);

  const questionnaire = await medplum.searchOne("Questionnaire", {
    url: instrument.questionnaireUrl,
  });
  if (!questionnaire?.id) {
    throw new Error(
      `No Questionnaire found for ${instrument.questionnaireUrl}; is the Instrument seeded?`
    );
  }

  const assignment = await createAssignment(medplum, {
    patientId: params.patientId,
    instrumentKey: instrument.key,
    questionnaireRef: `Questionnaire/${questionnaire.id}`,
  });

  const link = await issueAccessLink(
    medplum,
    assignment,
    instrument.questionnaireUrl
  );

  return {
    accessLinkUrl: buildAccessLinkUrl(params.patientAppBaseUrl, link.token),
    expiresAt: link.expiresAt,
    instrumentTitle: instrument.title,
  };
}

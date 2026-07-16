// The Worklist orchestration: the Coordinator app wiring that turns the domain
// Flag service + the modules that own the clinical data into what the Worklist
// screen and Flag detail render. It composes the deep modules through their entry
// points (module-boundaries) - the app sits at the top of the graph and passes
// the authenticated `useMedplum()` client in (ADR-0010). No FHIR resource shapes
// leak into the UI: the screen calls these and gets back domain results.
//
// Ordering is NOT done here - `listWorklist` already delegates to PriorityPolicy
// (ADR-0007); the app only enriches Flags with patient names for display. The
// Flag detail composition is validated end-to-end against a real Medplum in
// `worklistData.integration.test.ts`; at the UI seam these are injected so the
// jsdom tests never re-exercise the backend modules.

import type { MedplumClient } from "@medplum/core";
import { formatHumanName } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import type { Flag } from "../../../../packages/domain/workflow.js";
import { bandForScore } from "../../../../packages/domain/instrument-queries.js";
import { loadInstrumentByQuestionnaireUrl } from "../../../../packages/instrument/index.js";
import { getResponse, getScore } from "../../../../packages/scoring/index.js";
import { getFlag, listWorklist } from "../../../../packages/worklist/index.js";

/** A Worklist row: a prioritized Flag with the patient's display name. */
export interface WorklistRow {
  readonly flag: Flag;
  readonly patientName: string;
}

/** A Trigger that fired on the Response, with its human label (FR-22/29). */
export interface FiredTrigger {
  readonly code: string;
  readonly label: string;
  /** Acute-risk Triggers are highlighted in the detail (FR-29). */
  readonly acuteRisk: boolean;
}

/** One item's answer for the Flag detail's item-level view (FR-29). */
export interface AnswerLine {
  readonly linkId: string;
  readonly text: string;
  readonly answerLabel: string;
  readonly weight: number;
  /** True for the acute-risk item (notably Item 9), highlighted in the detail. */
  readonly acuteRisk: boolean;
}

/** The full FR-29 clinical signal for one Flag. */
export interface FlagDetail {
  readonly flag: Flag;
  readonly patientName: string;
  readonly instrumentTitle: string;
  /** ISO-8601 Response submission time. */
  readonly submittedAt: string;
  readonly total: number;
  /** Severity band the total falls in, if the Instrument defines one. */
  readonly band?: { readonly code: string; readonly label: string };
  readonly triggers: readonly FiredTrigger[];
  readonly answers: readonly AnswerLine[];
}

function patientName(patient: Patient): string {
  const name = patient.name?.[0];
  return name ? formatHumanName(name) : (patient.id ?? "Unknown patient");
}

async function patientNameById(
  medplum: MedplumClient,
  patientId: string
): Promise<string> {
  try {
    return patientName(await medplum.readResource("Patient", patientId));
  } catch {
    return patientId;
  }
}

/**
 * The prioritized Worklist for display (FR-23/24/25): the unresolved Flags in
 * `PriorityPolicy` order (from `listWorklist`), each enriched with its patient's
 * name. Names are resolved once per distinct patient.
 */
export async function loadWorklist(
  medplum: MedplumClient
): Promise<WorklistRow[]> {
  const flags = await listWorklist(medplum);
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(flags.map((f) => f.patientId))].map(async (id) => {
      names.set(id, await patientNameById(medplum, id));
    })
  );
  return flags.map((flag) => ({
    flag,
    patientName: names.get(flag.patientId) ?? flag.patientId,
  }));
}

/**
 * Compose the full FR-29 clinical signal for one Flag: patient identity, the
 * Instrument + Response submission time, the total Score + severity band, which
 * Trigger(s) fired (acute-risk highlighted), and the item-level answers (notably
 * the acute-risk item). Each piece is read through the owning module's entry
 * point - the Score and answers via the Scoring module, the Instrument config via
 * the Instrument module, the Flag via the Worklist module - never inline.
 */
export async function getFlagDetail(
  medplum: MedplumClient,
  flagId: string
): Promise<FlagDetail> {
  const { flag, responseId } = await getFlag(medplum, flagId);
  const response = await getResponse(medplum, responseId);
  const instrument = await loadInstrumentByQuestionnaireUrl(
    medplum,
    response.questionnaireUrl
  );
  const score = await getScore(medplum, responseId);
  const total = score?.value ?? 0;
  const patientName = await patientNameById(medplum, flag.patientId);

  const band = bandForScore(instrument, total);

  const triggers: FiredTrigger[] = flag.triggerCodes.map((code) => {
    const trigger = instrument.triggers.find((t) => t.code === code);
    return {
      code,
      label: trigger?.label ?? code,
      acuteRisk: trigger?.kind === "critical-item" ? trigger.acuteRisk : false,
    };
  });

  // Ordered by the Instrument's item order so the item-level view is complete and
  // stable (Item 9 appears in place), independent of answer submission order.
  const answers: AnswerLine[] = instrument.items.map((item) => {
    const answer = response.answers.find((a) => a.linkId === item.linkId);
    const option = answer
      ? item.options.find((o) => o.code === answer.answerCode)
      : undefined;
    return {
      linkId: item.linkId,
      text: item.text,
      answerLabel: option?.label ?? "-",
      weight: option?.weight ?? 0,
      acuteRisk: item.linkId === instrument.acuteRiskItemLinkId,
    };
  });

  return {
    flag,
    patientName,
    instrumentTitle: instrument.title,
    submittedAt: response.submittedAt,
    total,
    ...(band ? { band: { code: band.code, label: band.label } } : {}),
    triggers,
    answers,
  };
}

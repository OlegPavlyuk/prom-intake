// Provision an Instrument's definition into Medplum: the project CodeSystems
// (ADR-0003) and, per Instrument, its `Questionnaire` (items + weights) and
// InstrumentConfig `Basic` (bands, Triggers, acute-risk item). All upserts are
// idempotent (keyed on canonical url / stable key), so re-seeding leaves exactly
// one copy - safe to run repeatedly against a shared project.

import type { MedplumClient } from "@medplum/core";
import type { Instrument } from "../../domain/instrument.js";
import { CODE_SYSTEMS } from "./code-systems.js";
import { toBasic } from "./config-codec.js";
import { toQuestionnaire } from "./questionnaire-codec.js";
import {
  BASIC_TYPE_INSTRUMENT_CONFIG,
  CS_BASIC_TYPE,
  ID_INSTRUMENT_KEY,
} from "./urls.js";

/** Upsert the four project-owned CodeSystems (idempotent by canonical url). */
export async function seedCodeSystems(medplum: MedplumClient): Promise<void> {
  for (const cs of CODE_SYSTEMS) {
    await medplum.upsertResource(cs, { url: cs.url as string });
  }
}

/**
 * Upsert one Instrument's `Questionnaire` + config `Basic` (idempotent by
 * Questionnaire canonical url and by instrument-key identifier).
 */
export async function seedInstrument(
  medplum: MedplumClient,
  instrument: Instrument
): Promise<void> {
  await medplum.upsertResource(toQuestionnaire(instrument), {
    url: instrument.questionnaireUrl,
  });
  await medplum.upsertResource(toBasic(instrument), {
    identifier: `${ID_INSTRUMENT_KEY}|${instrument.key}`,
    code: `${CS_BASIC_TYPE}|${BASIC_TYPE_INSTRUMENT_CONFIG}`,
  });
}

/** Remove an Instrument's `Questionnaire` + config `Basic` (for test cleanup). */
export async function removeInstrument(
  medplum: MedplumClient,
  instrument: Instrument
): Promise<void> {
  const basic = await medplum.searchOne("Basic", {
    identifier: `${ID_INSTRUMENT_KEY}|${instrument.key}`,
  });
  if (basic?.id) {
    await medplum.deleteResource("Basic", basic.id);
  }
  const questionnaire = await medplum.searchOne("Questionnaire", {
    url: instrument.questionnaireUrl,
  });
  if (questionnaire?.id) {
    await medplum.deleteResource("Questionnaire", questionnaire.id);
  }
}

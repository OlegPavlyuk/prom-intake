// Load a fully-resolved Instrument from Medplum: its config `Basic` (bands,
// Triggers, acute-risk item, LOINC codes) composed with its `Questionnaire`
// (items + scoring weights). This loader is instrument-agnostic - it reads
// whatever config it finds and contains no PHQ-9 literals (FR-4, NFR-2).

import type { MedplumClient } from "@medplum/core";
import type { Instrument, InstrumentKey } from "../../domain/instrument.js";
import type { Questionnaire } from "@medplum/fhirtypes";
import { fromBasic } from "./config-codec.js";
import { itemsFromQuestionnaire } from "./questionnaire-codec.js";
import {
  BASIC_TYPE_INSTRUMENT_CONFIG,
  CS_BASIC_TYPE,
  ID_INSTRUMENT_KEY,
} from "./urls.js";

export async function loadInstrument(
  medplum: MedplumClient,
  key: InstrumentKey
): Promise<Instrument> {
  const basic = await medplum.searchOne("Basic", {
    identifier: `${ID_INSTRUMENT_KEY}|${key}`,
    code: `${CS_BASIC_TYPE}|${BASIC_TYPE_INSTRUMENT_CONFIG}`,
  });
  if (!basic) {
    throw new InstrumentNotFoundError(key);
  }

  const config = fromBasic(basic);

  const questionnaire = await medplum.searchOne("Questionnaire", {
    url: config.questionnaireUrl,
  });
  if (!questionnaire) {
    throw new InstrumentNotFoundError(
      key,
      `config references Questionnaire ${config.questionnaireUrl}, which is not present`
    );
  }

  return {
    key: config.key,
    questionnaireUrl: config.questionnaireUrl,
    title: config.title,
    totalScore: config.totalScore,
    ...(config.panelCode ? { panelCode: config.panelCode } : {}),
    items: itemsFromQuestionnaire(questionnaire),
    severityBands: config.severityBands,
    triggers: config.triggers,
    ...(config.acuteRiskItemLinkId !== undefined
      ? { acuteRiskItemLinkId: config.acuteRiskItemLinkId }
      : {}),
    ...(config.crisisResponse !== undefined
      ? { crisisResponse: config.crisisResponse }
      : {}),
  };
}

/**
 * Load a fully-resolved Instrument from the canonical URL of its `Questionnaire`
 * - the identity a submitted `QuestionnaireResponse` carries. Resolves the URL
 * to the Instrument's stable key via the `Questionnaire`'s instrument-key
 * identifier (the same identifier binds the config `Basic`), then defers to
 * {@link loadInstrument}. This is the Scoring Bot's entry into config (ADR-0004):
 * a Response references its `Questionnaire`, not the Instrument key directly.
 */
export async function loadInstrumentByQuestionnaireUrl(
  medplum: MedplumClient,
  questionnaireUrl: string
): Promise<Instrument> {
  const questionnaire: Questionnaire | undefined = await medplum.searchOne(
    "Questionnaire",
    { url: questionnaireUrl }
  );
  const key = questionnaire?.identifier?.find(
    (i) => i.system === ID_INSTRUMENT_KEY
  )?.value;
  if (!key) {
    throw new InstrumentNotFoundError(
      questionnaireUrl,
      "no Questionnaire with an instrument-key identifier matches this URL"
    );
  }
  return loadInstrument(medplum, key);
}

/** Raised when no Instrument (config or Questionnaire) is loadable for a key. */
export class InstrumentNotFoundError extends Error {
  constructor(key: InstrumentKey, detail?: string) {
    super(`Instrument "${key}" not found` + (detail ? `: ${detail}` : ""));
    this.name = "InstrumentNotFoundError";
  }
}

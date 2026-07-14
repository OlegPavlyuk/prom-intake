// Codec between an Instrument's items (with per-option scoring weights) and its
// FHIR `Questionnaire`. Each ordinal answer option carries its score as the SDC
// `itemWeight` extension (ADR-0004): Medplum does not evaluate it, the Instrument
// module reads and exposes it. Private to the Instrument module.

import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
} from "@medplum/fhirtypes";
import type {
  AnswerOption,
  Instrument,
  InstrumentItem,
} from "../../domain/instrument.js";
import {
  answerOptionSystem,
  EXT_ITEM_WEIGHT,
  ID_INSTRUMENT_KEY,
  LOINC,
} from "./urls.js";

// --- encode -----------------------------------------------------------------

function answerOption(
  option: AnswerOption,
  system: string
): QuestionnaireItemAnswerOption {
  return {
    valueCoding: { system, code: option.code, display: option.label },
    extension: [{ url: EXT_ITEM_WEIGHT, valueDecimal: option.weight }],
  };
}

function questionnaireItem(
  item: InstrumentItem,
  system: string
): QuestionnaireItem {
  return {
    linkId: item.linkId,
    text: item.text,
    type: "choice",
    required: true,
    answerOption: item.options.map((o) => answerOption(o, system)),
  };
}

/** Build the FHIR `Questionnaire` for an Instrument (items + scoring weights). */
export function toQuestionnaire(instrument: Instrument): Questionnaire {
  const system = answerOptionSystem(instrument.key);
  return {
    resourceType: "Questionnaire",
    url: instrument.questionnaireUrl,
    identifier: [{ system: ID_INSTRUMENT_KEY, value: instrument.key }],
    title: instrument.title,
    name: instrument.key,
    status: "active",
    code: [
      {
        system: LOINC,
        code: instrument.totalScore.code,
        display: instrument.totalScore.display,
      },
    ],
    item: instrument.items.map((i) => questionnaireItem(i, system)),
  };
}

// --- decode -----------------------------------------------------------------

function decodeOption(option: QuestionnaireItemAnswerOption): AnswerOption {
  const coding = option.valueCoding;
  if (!coding?.code) {
    throw new MalformedQuestionnaireError("answer option missing coding");
  }
  const weight = option.extension?.find(
    (e) => e.url === EXT_ITEM_WEIGHT
  )?.valueDecimal;
  if (weight === undefined) {
    throw new MalformedQuestionnaireError(
      `answer option "${coding.code}" missing itemWeight`
    );
  }
  return { code: coding.code, label: coding.display ?? coding.code, weight };
}

function decodeItem(item: QuestionnaireItem): InstrumentItem {
  if (!item.linkId) {
    throw new MalformedQuestionnaireError("item missing linkId");
  }
  return {
    linkId: item.linkId,
    text: item.text ?? "",
    options: (item.answerOption ?? []).map(decodeOption),
  };
}

/** Read an Instrument's items + scoring weights back from its `Questionnaire`. */
export function itemsFromQuestionnaire(
  questionnaire: Questionnaire
): readonly InstrumentItem[] {
  return (questionnaire.item ?? []).map(decodeItem);
}

/** Raised when a `Questionnaire` cannot be decoded to Instrument items. */
export class MalformedQuestionnaireError extends Error {
  constructor(detail: string) {
    super(`Malformed Questionnaire: ${detail}`);
    this.name = "MalformedQuestionnaireError";
  }
}

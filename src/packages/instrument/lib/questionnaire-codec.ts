// Codec between an Instrument's items (with per-option scoring weights) and its
// FHIR `Questionnaire`. Each ordinal answer option carries its score as the SDC
// `itemWeight` extension (ADR-0004): Medplum does not evaluate it, the Instrument
// module reads and exposes it. Private to the Instrument module.

import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
} from "@medplum/fhirtypes";
import type {
  AnswerOption,
  Instrument,
  InstrumentItem,
} from "../../domain/instrument.js";
import type { ResponseAnswer } from "../../domain/workflow.js";
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

/**
 * Build the FHIR `QuestionnaireResponse` for a patient's submitted answers,
 * mirroring {@link toQuestionnaire} on the response side. Each domain answer
 * (`linkId` + option `code`) is encoded as a `valueCoding` in the Instrument's
 * own answer-option system, so a downstream reader (`getQuestionnaireAnswers`,
 * the scoring Bot) recovers the same code the weights are keyed on (ADR-0004).
 * `subject` is the bound patient and `basedOn` the Assignment `Task`, so the
 * Response is attributable and traceable (FR-13/FR-32). An answer referencing an
 * unknown item or option is rejected - the submit flow validates completeness
 * first, so this is defence in depth.
 */
export function toQuestionnaireResponse(
  instrument: Instrument,
  args: {
    readonly patientId: string;
    readonly assignmentId: string;
    readonly answers: readonly ResponseAnswer[];
    readonly authoredOn: string;
  }
): QuestionnaireResponse {
  const system = answerOptionSystem(instrument.key);
  const item: QuestionnaireResponseItem[] = args.answers.map((a) => {
    const question = instrument.items.find((i) => i.linkId === a.linkId);
    const option = question?.options.find((o) => o.code === a.answerCode);
    if (!question || !option) {
      throw new MalformedQuestionnaireError(
        `answer "${a.answerCode}" is not a valid option for item "${a.linkId}"`
      );
    }
    return {
      linkId: a.linkId,
      text: question.text,
      answer: [
        { valueCoding: { system, code: option.code, display: option.label } },
      ],
    };
  });
  return {
    resourceType: "QuestionnaireResponse",
    status: "completed",
    questionnaire: instrument.questionnaireUrl,
    subject: { reference: `Patient/${args.patientId}` },
    basedOn: [{ reference: `Task/${args.assignmentId}` }],
    authored: args.authoredOn,
    item,
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

// Codec between the domain InstrumentConfig (severity bands, Triggers, acute-risk
// item, total/panel LOINC) and its FHIR carrier: a project-owned `Basic`
// resource (ADR-0004 delegates this schema to the data model). The payload is
// carried as structured extensions under one root extension; the Basic is keyed
// by the Instrument's stable key and marked with a project `Basic.code`.
//
// Private to the Instrument module - nothing outside touches the `Basic`.

import type { Basic, Coding, Extension } from "@medplum/fhirtypes";
import type { LoincCoding } from "../../domain/coding.js";
import type {
  Instrument,
  SeverityBand,
  TriggerDefinition,
} from "../../domain/instrument.js";
import {
  BASIC_TYPE_INSTRUMENT_CONFIG,
  CS_BASIC_TYPE,
  EXT_ACUTE_RISK_ITEM,
  EXT_BAND_CODE,
  EXT_BAND_LABEL,
  EXT_BAND_MAX,
  EXT_BAND_MIN,
  EXT_CONFIG_ROOT,
  EXT_PANEL_CODE,
  EXT_QUESTIONNAIRE_URL,
  EXT_SEVERITY_BAND,
  EXT_TITLE,
  EXT_TOTAL_SCORE,
  EXT_TRIGGER,
  EXT_TRIGGER_ACUTE_RISK,
  EXT_TRIGGER_AT_OR_ABOVE_SCORE,
  EXT_TRIGGER_AT_OR_ABOVE_VALUE,
  EXT_TRIGGER_CODE,
  EXT_TRIGGER_KIND,
  EXT_TRIGGER_LABEL,
  EXT_TRIGGER_LINK_ID,
  EXT_TRIGGER_PRIORITY,
  ID_INSTRUMENT_KEY,
  LOINC,
} from "./urls.js";

/** The portion of an Instrument that lives in the InstrumentConfig `Basic`. */
export interface ConfigPart {
  readonly key: string;
  readonly questionnaireUrl: string;
  readonly title: string;
  readonly totalScore: LoincCoding;
  readonly panelCode?: LoincCoding;
  readonly severityBands: readonly SeverityBand[];
  readonly triggers: readonly TriggerDefinition[];
  readonly acuteRiskItemLinkId?: string;
}

// --- encode -----------------------------------------------------------------

function loincCoding(coding: LoincCoding): Coding {
  return { system: LOINC, code: coding.code, display: coding.display };
}

function bandExtension(band: SeverityBand): Extension {
  const sub: Extension[] = [
    { url: EXT_BAND_CODE, valueCode: band.code },
    { url: EXT_BAND_LABEL, valueString: band.label },
    { url: EXT_BAND_MIN, valueInteger: band.minScore },
  ];
  if (band.maxScore !== null) {
    sub.push({ url: EXT_BAND_MAX, valueInteger: band.maxScore });
  }
  return { url: EXT_SEVERITY_BAND, extension: sub };
}

function triggerExtension(trigger: TriggerDefinition): Extension {
  const sub: Extension[] = [
    { url: EXT_TRIGGER_KIND, valueCode: trigger.kind },
    { url: EXT_TRIGGER_CODE, valueCode: trigger.code },
    { url: EXT_TRIGGER_LABEL, valueString: trigger.label },
    { url: EXT_TRIGGER_PRIORITY, valueCode: trigger.priority },
  ];
  if (trigger.kind === "severity-band") {
    sub.push({
      url: EXT_TRIGGER_AT_OR_ABOVE_SCORE,
      valueInteger: trigger.atOrAboveScore,
    });
  } else {
    sub.push(
      { url: EXT_TRIGGER_LINK_ID, valueString: trigger.linkId },
      {
        url: EXT_TRIGGER_AT_OR_ABOVE_VALUE,
        valueInteger: trigger.atOrAboveValue,
      },
      { url: EXT_TRIGGER_ACUTE_RISK, valueBoolean: trigger.acuteRisk }
    );
  }
  return { url: EXT_TRIGGER, extension: sub };
}

/** Build the InstrumentConfig `Basic` for an Instrument. */
export function toBasic(instrument: Instrument): Basic {
  const payload: Extension[] = [
    { url: EXT_QUESTIONNAIRE_URL, valueUri: instrument.questionnaireUrl },
    { url: EXT_TITLE, valueString: instrument.title },
    { url: EXT_TOTAL_SCORE, valueCoding: loincCoding(instrument.totalScore) },
  ];
  if (instrument.panelCode) {
    payload.push({
      url: EXT_PANEL_CODE,
      valueCoding: loincCoding(instrument.panelCode),
    });
  }
  if (instrument.acuteRiskItemLinkId !== undefined) {
    payload.push({
      url: EXT_ACUTE_RISK_ITEM,
      valueString: instrument.acuteRiskItemLinkId,
    });
  }
  for (const band of instrument.severityBands) {
    payload.push(bandExtension(band));
  }
  for (const trigger of instrument.triggers) {
    payload.push(triggerExtension(trigger));
  }

  return {
    resourceType: "Basic",
    identifier: [{ system: ID_INSTRUMENT_KEY, value: instrument.key }],
    code: {
      coding: [{ system: CS_BASIC_TYPE, code: BASIC_TYPE_INSTRUMENT_CONFIG }],
    },
    extension: [{ url: EXT_CONFIG_ROOT, extension: payload }],
  };
}

// --- decode -----------------------------------------------------------------

function subOf(ext: Extension | undefined, url: string): Extension | undefined {
  return ext?.extension?.find((e) => e.url === url);
}

function requireString(ext: Extension | undefined, url: string): string {
  const value = subOf(ext, url)?.valueString ?? subOf(ext, url)?.valueUri;
  if (value === undefined) {
    throw new MalformedInstrumentConfigError(`missing string "${url}"`);
  }
  return value;
}

function requireInteger(ext: Extension | undefined, url: string): number {
  const value = subOf(ext, url)?.valueInteger;
  if (value === undefined) {
    throw new MalformedInstrumentConfigError(`missing integer "${url}"`);
  }
  return value;
}

function requireCode(ext: Extension | undefined, url: string): string {
  const value = subOf(ext, url)?.valueCode;
  if (value === undefined) {
    throw new MalformedInstrumentConfigError(`missing code "${url}"`);
  }
  return value;
}

function requireLoinc(ext: Extension | undefined, url: string): LoincCoding {
  const coding = subOf(ext, url)?.valueCoding;
  if (!coding?.code) {
    throw new MalformedInstrumentConfigError(`missing coding "${url}"`);
  }
  return { code: coding.code, display: coding.display ?? "" };
}

function decodeBand(ext: Extension): SeverityBand {
  const max = subOf(ext, EXT_BAND_MAX)?.valueInteger;
  return {
    code: requireCode(ext, EXT_BAND_CODE),
    label: requireString(ext, EXT_BAND_LABEL),
    minScore: requireInteger(ext, EXT_BAND_MIN),
    maxScore: max ?? null,
  };
}

function decodeTrigger(ext: Extension): TriggerDefinition {
  const kind = requireCode(ext, EXT_TRIGGER_KIND);
  const base = {
    code: requireCode(ext, EXT_TRIGGER_CODE),
    label: requireString(ext, EXT_TRIGGER_LABEL),
    priority: requireCode(ext, EXT_TRIGGER_PRIORITY),
  };
  if (kind === "severity-band") {
    return {
      kind: "severity-band",
      ...base,
      priority: base.priority as TriggerDefinition["priority"],
      atOrAboveScore: requireInteger(ext, EXT_TRIGGER_AT_OR_ABOVE_SCORE),
    };
  }
  if (kind === "critical-item") {
    return {
      kind: "critical-item",
      ...base,
      priority: base.priority as TriggerDefinition["priority"],
      linkId: requireString(ext, EXT_TRIGGER_LINK_ID),
      atOrAboveValue: requireInteger(ext, EXT_TRIGGER_AT_OR_ABOVE_VALUE),
      acuteRisk: subOf(ext, EXT_TRIGGER_ACUTE_RISK)?.valueBoolean ?? false,
    };
  }
  throw new MalformedInstrumentConfigError(`unknown trigger kind "${kind}"`);
}

/** Read a domain InstrumentConfig back from its `Basic` carrier. */
export function fromBasic(basic: Basic): ConfigPart {
  const key = basic.identifier?.find(
    (i) => i.system === ID_INSTRUMENT_KEY
  )?.value;
  if (!key) {
    throw new MalformedInstrumentConfigError(
      "missing instrument-key identifier"
    );
  }
  const root = basic.extension?.find((e) => e.url === EXT_CONFIG_ROOT);
  if (!root) {
    throw new MalformedInstrumentConfigError("missing config payload");
  }
  const bands = (root.extension ?? [])
    .filter((e) => e.url === EXT_SEVERITY_BAND)
    .map(decodeBand);
  const triggers = (root.extension ?? [])
    .filter((e) => e.url === EXT_TRIGGER)
    .map(decodeTrigger);

  const panelCoding = subOf(root, EXT_PANEL_CODE)?.valueCoding;
  return {
    key,
    questionnaireUrl: requireString(root, EXT_QUESTIONNAIRE_URL),
    title: requireString(root, EXT_TITLE),
    totalScore: requireLoinc(root, EXT_TOTAL_SCORE),
    ...(panelCoding?.code
      ? {
          panelCode: {
            code: panelCoding.code,
            display: panelCoding.display ?? "",
          },
        }
      : {}),
    severityBands: bands,
    triggers,
    acuteRiskItemLinkId: subOf(root, EXT_ACUTE_RISK_ITEM)?.valueString,
  };
}

/** Raised when an InstrumentConfig `Basic` cannot be decoded to the domain shape. */
export class MalformedInstrumentConfigError extends Error {
  constructor(detail: string) {
    super(`Malformed InstrumentConfig: ${detail}`);
    this.name = "MalformedInstrumentConfigError";
  }
}

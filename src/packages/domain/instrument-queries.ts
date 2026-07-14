// Pure accessors over a loaded Instrument (no FHIR, no I/O). Entry point of the
// `domain` package. These are the shared, off-server building blocks the pure
// kernels (scoring engine, Flag detail) compose on top of (ADR-0009), and the
// place the "expose weights / bands / acute-risk item" behaviour is unit-tested.

import type { Instrument, InstrumentItem, SeverityBand } from "./instrument.js";

/**
 * Scoring weight an answer contributes for a given item, or `undefined` when the
 * item or option is not part of the Instrument. Weight is looked up by option
 * code so display text can change without affecting the Score (ADR-0004).
 */
export function weightFor(
  instrument: Instrument,
  linkId: string,
  answerCode: string
): number | undefined {
  const item = instrument.items.find((i) => i.linkId === linkId);
  return item?.options.find((o) => o.code === answerCode)?.weight;
}

/**
 * The severity band a total Score falls in, or `undefined` when no band covers
 * it. The open-ended top band (`maxScore === null`) matches any score at or
 * above its `minScore`.
 */
export function bandForScore(
  instrument: Instrument,
  total: number
): SeverityBand | undefined {
  return instrument.severityBands.find(
    (b) => total >= b.minScore && (b.maxScore === null || total <= b.maxScore)
  );
}

/**
 * The item that drives the client-side Crisis Response (FR-15), or `undefined`
 * when the Instrument defines no acute-risk item.
 */
export function acuteRiskItem(
  instrument: Instrument
): InstrumentItem | undefined {
  if (instrument.acuteRiskItemLinkId === undefined) {
    return undefined;
  }
  return instrument.items.find(
    (i) => i.linkId === instrument.acuteRiskItemLinkId
  );
}

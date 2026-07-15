import { describe, expect, it } from "vitest";
// Exercised through the package entry points (its seam), like every other caller.
import type { Instrument } from "../instrument.js";
import {
  acuteRiskItem,
  bandForScore,
  isAcuteRiskAnswer,
  weightFor,
} from "../instrument-queries.js";

// A small, self-contained Instrument fixture: two ordinal items and three bands,
// with an acute-risk item. Kept off-server and PHQ-9-agnostic - it only exercises
// the pure accessor logic, not any real Instrument's numbers.
const fixture: Instrument = {
  key: "fixture",
  questionnaireUrl: "https://example.test/Questionnaire/fixture",
  title: "Fixture Instrument",
  totalScore: { code: "0000-0", display: "Fixture total score" },
  items: [
    {
      linkId: "q1",
      text: "First question",
      options: [
        { code: "none", label: "None", weight: 0 },
        { code: "some", label: "Some", weight: 2 },
      ],
    },
    {
      linkId: "q2",
      text: "Acute question",
      options: [
        { code: "no", label: "No", weight: 0 },
        { code: "yes", label: "Yes", weight: 3 },
      ],
    },
  ],
  severityBands: [
    { code: "low", label: "Low", minScore: 0, maxScore: 2 },
    { code: "mid", label: "Mid", minScore: 3, maxScore: 4 },
    { code: "high", label: "High", minScore: 5, maxScore: null },
  ],
  triggers: [
    {
      kind: "critical-item",
      code: "fixture-acute-risk",
      label: "Acute question positive",
      priority: "acute-risk",
      linkId: "q2",
      atOrAboveValue: 3,
      acuteRisk: true,
    },
  ],
  acuteRiskItemLinkId: "q2",
};

describe("weightFor", () => {
  it("returns the chosen option's weight", () => {
    expect(weightFor(fixture, "q1", "some")).toBe(2);
    expect(weightFor(fixture, "q2", "yes")).toBe(3);
    expect(weightFor(fixture, "q1", "none")).toBe(0);
  });

  it("returns undefined for an unknown item or option", () => {
    expect(weightFor(fixture, "nope", "some")).toBeUndefined();
    expect(weightFor(fixture, "q1", "nope")).toBeUndefined();
  });
});

describe("bandForScore", () => {
  it("maps a total to the band whose inclusive range covers it", () => {
    expect(bandForScore(fixture, 0)?.code).toBe("low");
    expect(bandForScore(fixture, 2)?.code).toBe("low");
    expect(bandForScore(fixture, 3)?.code).toBe("mid");
    expect(bandForScore(fixture, 4)?.code).toBe("mid");
  });

  it("uses the open-ended top band for any score at or above its minimum", () => {
    expect(bandForScore(fixture, 5)?.code).toBe("high");
    expect(bandForScore(fixture, 999)?.code).toBe("high");
  });

  it("returns undefined when no band covers the score", () => {
    expect(bandForScore(fixture, -1)).toBeUndefined();
  });
});

describe("acuteRiskItem", () => {
  it("returns the item named by the acute-risk linkId", () => {
    expect(acuteRiskItem(fixture)?.linkId).toBe("q2");
  });

  it("returns undefined when the Instrument defines no acute-risk item", () => {
    const noAcute: Instrument = { ...fixture, acuteRiskItemLinkId: undefined };
    expect(acuteRiskItem(noAcute)).toBeUndefined();
  });
});

describe("isAcuteRiskAnswer", () => {
  it("is true when the answer's weight meets the Acute-risk trigger threshold", () => {
    expect(isAcuteRiskAnswer(fixture, "q2", "yes")).toBe(true);
  });

  it("is false when the answer's weight is below the threshold", () => {
    expect(isAcuteRiskAnswer(fixture, "q2", "no")).toBe(false);
  });

  it("is false for an item that is not the acute-risk item", () => {
    expect(isAcuteRiskAnswer(fixture, "q1", "some")).toBe(false);
  });

  it("is false when the Instrument defines no Acute-risk trigger", () => {
    const noTrigger: Instrument = { ...fixture, triggers: [] };
    expect(isAcuteRiskAnswer(noTrigger, "q2", "yes")).toBe(false);
  });
});

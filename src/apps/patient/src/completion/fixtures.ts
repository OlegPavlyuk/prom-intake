import type { Instrument } from "../../../../packages/domain/instrument.js";

// A small, self-contained Instrument fixture (mirrors the pattern in
// src/packages/domain/tests/instrument-queries.test.ts): two ordinal items,
// one of them acute-risk, and Crisis Response content. Kept off PHQ-9's exact
// numbers so these tests exercise the client seam generically, not one
// Instrument's literals.
export const FIXTURE_INSTRUMENT: Instrument = {
  key: "fixture",
  questionnaireUrl: "https://example.test/Questionnaire/fixture",
  title: "Fixture Instrument",
  totalScore: { code: "0000-0", display: "Fixture total score" },
  items: [
    {
      linkId: "q1",
      text: "First question",
      options: [
        { code: "no", label: "No", weight: 0 },
        { code: "yes", label: "Yes", weight: 1 },
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
  severityBands: [],
  triggers: [
    {
      kind: "critical-item",
      code: "fixture-acute-risk",
      label: "Acute question positive",
      priority: "acute-risk",
      linkId: "q2",
      atOrAboveValue: 1,
      acuteRisk: true,
    },
  ],
  acuteRiskItemLinkId: "q2",
  crisisResponse: {
    message: "Help is available right now.",
    phone: "988",
  },
};

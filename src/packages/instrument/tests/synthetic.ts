// A synthetic second Instrument that exists ONLY in tests (spec Out of Scope: no
// second shipped Instrument). It is deliberately unlike PHQ-9 - two items, a
// different weight scale, different bands, a NON-acute critical-item Trigger, a
// different severity cutoff, and no acute-risk item - so that loading it through
// the same module proves the loader is config-driven with zero PHQ-9 literals
// (FR-4, NFR-2). If any PHQ-9 number were baked into the loader, these
// assertions would fail.

import type { Instrument } from "../../domain/instrument.js";

export const SYNTHETIC: Instrument = {
  key: "synthetic-2item-test",
  questionnaireUrl:
    "https://prom-intake.example/fhir/Questionnaire/synthetic-2item-test",
  title: "Synthetic Two-Item Test Instrument",
  totalScore: { code: "99999-9", display: "Synthetic total score" },
  // No panelCode - proves the loader treats it as optional.
  items: [
    {
      linkId: "syn-item-1",
      text: "Synthetic question one",
      options: [
        { code: "low", label: "Low", weight: 0 },
        { code: "mid", label: "Mid", weight: 2 },
        { code: "high", label: "High", weight: 5 },
      ],
    },
    {
      linkId: "syn-item-2",
      text: "Synthetic question two",
      options: [
        { code: "absent", label: "Absent", weight: 0 },
        { code: "present", label: "Present", weight: 4 },
      ],
    },
  ],
  severityBands: [
    { code: "calm", label: "Calm", minScore: 0, maxScore: 3 },
    { code: "elevated", label: "Elevated", minScore: 4, maxScore: null },
  ],
  triggers: [
    {
      kind: "severity-band",
      code: "syn-elevated",
      label: "Synthetic total 4 or above",
      priority: "urgent",
      atOrAboveScore: 4,
    },
    {
      // A generic (non-acute) critical-item Trigger, proving the FR-19 mechanism
      // exists independent of PHQ-9's acute-risk instantiation.
      kind: "critical-item",
      code: "syn-item-2-present",
      label: "Synthetic item two present",
      priority: "routine",
      linkId: "syn-item-2",
      atOrAboveValue: 4,
      acuteRisk: false,
    },
  ],
  // No acuteRiskItemLinkId - the synthetic Instrument has no acute-risk item.
};

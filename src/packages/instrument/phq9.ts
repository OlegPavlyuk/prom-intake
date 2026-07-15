// PHQ-9 as pure configuration - the first shipped Instrument (FR-2). This is the
// only place PHQ-9 numbers live; the loader/codecs are instrument-agnostic, so a
// future GAD-7 is a new config like this one, not an engine change (FR-4, NFR-2).
//
// Clinical facts (item texts, LOINC codes, 0-3 scoring, 0-27 range, 5 severity
// bands, the >=10 flag cutoff, Item-9 acute-risk) are traced in
// docs/research/phq-9-scoring-and-interpretation.md.

import type { AnswerOption, Instrument } from "../domain/instrument.js";
import { PROJECT_BASE } from "./lib/urls.js";

/** The four PHQ-9 Likert options, scored 0-3 (shared by all nine items). */
const LIKERT: readonly AnswerOption[] = [
  { code: "not-at-all", label: "Not at all", weight: 0 },
  { code: "several-days", label: "Several days", weight: 1 },
  {
    code: "more-than-half-the-days",
    label: "More than half the days",
    weight: 2,
  },
  { code: "nearly-every-day", label: "Nearly every day", weight: 3 },
];

/**
 * PHQ-9 item stems. Over the last 2 weeks, how often have you been bothered by
 * any of the following problems? (Official PHQ-9 wording; Item 9 is the
 * acute-risk item.)
 */
const ITEM_TEXTS: readonly string[] = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself - or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed - or the opposite, being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead, or of hurting yourself in some way",
];

const ACUTE_RISK_LINK_ID = "phq9-item-9";

export const PHQ9: Instrument = {
  key: "phq-9",
  questionnaireUrl: `${PROJECT_BASE}/Questionnaire/phq-9`,
  title: "Patient Health Questionnaire-9 (PHQ-9)",
  totalScore: {
    code: "44261-6",
    display:
      "Patient Health Questionnaire 9 item (PHQ-9) total score [Reported]",
  },
  panelCode: {
    code: "44249-1",
    display: "PHQ-9 quick depression assessment panel [Reported.PHQ]",
  },
  items: ITEM_TEXTS.map((text, i) => ({
    linkId: `phq9-item-${i + 1}`,
    text,
    options: LIKERT,
  })),
  severityBands: [
    { code: "none-minimal", label: "None-minimal", minScore: 0, maxScore: 4 },
    { code: "mild", label: "Mild", minScore: 5, maxScore: 9 },
    { code: "moderate", label: "Moderate", minScore: 10, maxScore: 14 },
    {
      code: "moderately-severe",
      label: "Moderately severe",
      minScore: 15,
      maxScore: 19,
    },
    { code: "severe", label: "Severe", minScore: 20, maxScore: null },
  ],
  triggers: [
    {
      kind: "severity-band",
      code: "phq9-moderate-or-above",
      label: "PHQ-9 total 10 or above (moderate or above)",
      priority: "urgent",
      atOrAboveScore: 10,
    },
    {
      kind: "critical-item",
      code: "phq9-item-9-acute-risk",
      label: "PHQ-9 Item 9 positive (self-harm / acute risk)",
      priority: "acute-risk",
      linkId: ACUTE_RISK_LINK_ID,
      atOrAboveValue: 1,
      acuteRisk: true,
    },
  ],
  acuteRiskItemLinkId: ACUTE_RISK_LINK_ID,
  crisisResponse: {
    message:
      "If you're having thoughts of harming yourself, you're not alone and help is available right now.",
    phone: "988",
  },
};

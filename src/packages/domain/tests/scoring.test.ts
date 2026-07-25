import { describe, expect, it } from "vitest";
// Exercised through the package entry points (its seam), like every other caller.
import type { Instrument } from "../instrument.js";
import type { Response, ResponseAnswer } from "../workflow.js";
import { score } from "../scoring.js";
// Driving the *shipped* PHQ-9 config proves the generic engine scores the real
// Instrument correctly. Importing another package's entry point (a root file) is
// exactly what the tests-through-entrypoints boundary permits.
import { PHQ9 } from "../../instrument/phq9.js";

// --- Fixtures ---------------------------------------------------------------

// A synthetic second Instrument, deliberately unlike PHQ-9: a different weight
// scale, different bands, a different total LOINC code, and a NON-acute
// critical-item Trigger with no acute-risk item. Driving `score()` with both
// PHQ-9 and this - via config only - is the concrete FR-4/NFR-2 genericity
// proof: if any PHQ-9 number were baked into the engine, these would fail.
const SYNTHETIC: Instrument = {
  key: "syn-test",
  questionnaireUrl: "https://example.test/Questionnaire/syn-test",
  title: "Synthetic Two-Item Instrument",
  totalScore: { code: "77777-7", display: "Synthetic total score" },
  items: [
    {
      linkId: "s1",
      text: "Synthetic question one",
      options: [
        { code: "a", label: "A", weight: 0 },
        { code: "b", label: "B", weight: 5 },
        { code: "c", label: "C", weight: 8 },
      ],
    },
    {
      linkId: "s2",
      text: "Synthetic question two",
      options: [
        { code: "no", label: "No", weight: 0 },
        { code: "yes", label: "Yes", weight: 2 },
      ],
    },
  ],
  severityBands: [
    { code: "calm", label: "Calm", minScore: 0, maxScore: 9 },
    { code: "elevated", label: "Elevated", minScore: 10, maxScore: null },
  ],
  triggers: [
    {
      kind: "severity-band",
      code: "syn-elevated",
      label: "Synthetic total 10 or above",
      priority: "urgent",
      atOrAboveScore: 10,
    },
    {
      kind: "critical-item",
      code: "syn-s2-present",
      label: "Synthetic item two present",
      priority: "routine",
      linkId: "s2",
      atOrAboveValue: 2,
      acuteRisk: false,
    },
  ],
  // No acuteRiskItemLinkId - the synthetic Instrument has no acute-risk item.
};

const RESPONSE_ID = "qr-123";
const PATIENT_ID = "patient-7";
const SUBMITTED_AT = "2026-07-15T10:00:00.000Z";

function responseFor(
  instrument: Instrument,
  answers: Record<string, string>
): Response {
  const items: ResponseAnswer[] = Object.entries(answers).map(
    ([linkId, answerCode]) => ({ linkId, answerCode })
  );
  return {
    id: RESPONSE_ID,
    instrumentKey: instrument.key,
    patientId: PATIENT_ID,
    submittedAt: SUBMITTED_AT,
    answers: items,
  };
}

/** PHQ-9 answers: all nine items "not-at-all" (0), with the given overrides. */
function phq9Answers(
  overrides: Record<string, string> = {}
): Record<string, string> {
  const base: Record<string, string> = {};
  for (const item of PHQ9.items) {
    base[item.linkId] = "not-at-all";
  }
  return { ...base, ...overrides };
}

// --- Scoring (FR-3) ---------------------------------------------------------

describe("score - total (FR-3)", () => {
  it("sums the chosen options' itemWeight into the total", () => {
    // items 1-3 nearly-every-day (3 each) + item 4 several-days (1) = 10.
    const response = responseFor(
      PHQ9,
      phq9Answers({
        "phq9-item-1": "nearly-every-day",
        "phq9-item-2": "nearly-every-day",
        "phq9-item-3": "nearly-every-day",
        "phq9-item-4": "several-days",
      })
    );
    expect(score(response, PHQ9).score.total).toBe(10);
  });

  it("is zero when every answer contributes zero weight", () => {
    const result = score(responseFor(PHQ9, phq9Answers()), PHQ9);
    expect(result.score.total).toBe(0);
  });

  it("records the severity band the total falls in", () => {
    const result = score(
      responseFor(
        PHQ9,
        phq9Answers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
          "phq9-item-4": "several-days",
        })
      ),
      PHQ9
    );
    expect(result.score.bandCode).toBe("moderate");
  });

  it("scores a different Instrument on its own weight scale (config only)", () => {
    // Synthetic: s1=c (8) + s2=yes (2) = 10.
    const result = score(
      responseFor(SYNTHETIC, { s1: "c", s2: "yes" }),
      SYNTHETIC
    );
    expect(result.score.total).toBe(10);
    expect(result.score.bandCode).toBe("elevated");
  });
});

// --- Score Observation (ObservationEmitter; FR-3, FR-32) --------------------

describe("score - Score Observation (ObservationEmitter)", () => {
  it("emits one total-score Observation carrying the config's LOINC total, the total value, subject and derivedFrom", () => {
    const response = responseFor(
      PHQ9,
      phq9Answers({ "phq9-item-1": "nearly-every-day" })
    );
    const { observations } = score(response, PHQ9);

    expect(observations).toHaveLength(1);
    const obs = observations[0];
    expect(obs?.code).toEqual(PHQ9.totalScore);
    expect(obs?.value).toBe(3);
    expect(obs?.patientId).toBe(PATIENT_ID);
    expect(obs?.derivedFromResponseId).toBe(RESPONSE_ID);
  });

  it("reads the LOINC total from config, not a PHQ-9 literal", () => {
    const obs = score(responseFor(SYNTHETIC, { s1: "a", s2: "no" }), SYNTHETIC)
      .observations[0];
    expect(obs?.code).toEqual(SYNTHETIC.totalScore);
  });

  it("always emits the Score Observation even when no Trigger fires (FR-32)", () => {
    const result = score(responseFor(PHQ9, phq9Answers()), PHQ9);
    expect(result.flags).toHaveLength(0);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.value).toBe(0);
  });
});

// --- Severity-band trigger (FR-18) ------------------------------------------

describe("score - severity-band Trigger (FR-18)", () => {
  it("raises a Flag when the total is at or above the configured cutoff (>= 10)", () => {
    const result = score(
      responseFor(
        PHQ9,
        phq9Answers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
          "phq9-item-4": "several-days",
        })
      ),
      PHQ9
    );
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]?.triggerCodes).toEqual(["phq9-moderate-or-above"]);
    expect(result.flags[0]?.priority).toBe("urgent");
  });

  it("does not raise the severity Flag one point below the cutoff", () => {
    // items 1-3 nearly-every-day = 9, just below 10.
    const result = score(
      responseFor(
        PHQ9,
        phq9Answers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
        })
      ),
      PHQ9
    );
    expect(result.flags).toHaveLength(0);
  });
});

// --- Critical-item trigger, independent of total (FR-19) --------------------

describe("score - critical-item Trigger (FR-19)", () => {
  it("raises a Flag from a specific item's answer even when the total is below every band cutoff", () => {
    // s1=a (0) + s2=yes (2) = 2: below the elevated cutoff (10), but s2 meets
    // the critical-item threshold, so the critical-item Flag fires on its own.
    const result = score(
      responseFor(SYNTHETIC, { s1: "a", s2: "yes" }),
      SYNTHETIC
    );
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]?.triggerCodes).toEqual(["syn-s2-present"]);
    expect(result.flags[0]?.priority).toBe("routine");
  });

  it("does not fire when the item's answer is below the threshold", () => {
    const result = score(
      responseFor(SYNTHETIC, { s1: "a", s2: "no" }),
      SYNTHETIC
    );
    expect(result.flags).toHaveLength(0);
  });
});

// --- Acute-risk trigger (FR-20) ---------------------------------------------

describe("score - acute-risk Trigger (FR-20)", () => {
  it("raises the acute-risk Flag from the configured item (PHQ-9 Item 9 >= 1), independent of total", () => {
    // Only Item 9 positive: total 1, below any band cutoff, yet acute-risk fires.
    const result = score(
      responseFor(PHQ9, phq9Answers({ "phq9-item-9": "several-days" })),
      PHQ9
    );
    expect(result.score.total).toBe(1);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]?.triggerCodes).toEqual(["phq9-item-9-acute-risk"]);
    expect(result.flags[0]?.priority).toBe("acute-risk");
  });

  it("does not fire the acute-risk Flag when Item 9 is not-at-all (0)", () => {
    const result = score(responseFor(PHQ9, phq9Answers()), PHQ9);
    expect(
      result.flags.some((f) =>
        f.triggerCodes.includes("phq9-item-9-acute-risk")
      )
    ).toBe(false);
  });
});

// --- Multiple Triggers on one Response (FR-21, FR-22) -----------------------

describe("score - multiple Triggers on one Response (FR-21, FR-22; ADR-0011)", () => {
  it("raises a single Flag carrying every fired Trigger's reason, ranked at the highest tier", () => {
    // items 1-3 nearly-every-day (9) + item 4 several-days (1) = 10 (severity),
    // plus Item 9 nearly-every-day (acute-risk): total 13, both Triggers fire.
    const result = score(
      responseFor(
        PHQ9,
        phq9Answers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
          "phq9-item-4": "several-days",
          "phq9-item-9": "nearly-every-day",
        })
      ),
      PHQ9
    );
    expect(result.score.total).toBe(13);
    // One Flag for the Response, not one per Trigger (ADR-0011).
    expect(result.flags).toHaveLength(1);
    const flag = result.flags[0]!;
    // It records every reason (FR-22 audit): both fired Trigger codes.
    expect([...flag.triggerCodes].sort()).toEqual([
      "phq9-item-9-acute-risk",
      "phq9-moderate-or-above",
    ]);
    // Priority is the highest tier among the reasons: acute-risk outranks urgent.
    expect(flag.priority).toBe("acute-risk");
  });

  it("takes the highest tier among reasons on a different Instrument (config only)", () => {
    // Synthetic: s1=c (8) + s2=yes (2) = 10: elevated band (urgent) AND s2
    // critical-item (routine) - one Flag, ranked at the higher tier (urgent).
    const result = score(
      responseFor(SYNTHETIC, { s1: "c", s2: "yes" }),
      SYNTHETIC
    );
    expect(result.flags).toHaveLength(1);
    const flag = result.flags[0]!;
    expect([...flag.triggerCodes].sort()).toEqual([
      "syn-elevated",
      "syn-s2-present",
    ]);
    expect(flag.priority).toBe("urgent");
  });
});

// --- Raised Flag domain object (Flag-construction fn) -----------------------

describe("score - raised Flag domain object", () => {
  it("yields an Open Flag authored at the Response submission time, for the Response's patient", () => {
    const result = score(
      responseFor(PHQ9, phq9Answers({ "phq9-item-9": "several-days" })),
      PHQ9
    );
    const flag = result.flags[0];
    expect(flag?.status).toBe("Open");
    expect(flag?.createdAt).toBe(SUBMITTED_AT);
    expect(flag?.patientId).toBe(PATIENT_ID);
  });
});

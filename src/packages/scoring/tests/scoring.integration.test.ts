import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient, QuestionnaireResponse } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
import { CS_TASK_CODE, TASK_CODE_FLAG } from "../../terminology/systems.js";
import { seedInstrument } from "../../instrument/seed.js";
import { PHQ9 } from "../../instrument/phq9.js";
import { toQuestionnaireResponse } from "../../instrument/index.js";
import { createAssignment, getAssignment } from "../../assignment/index.js";
import type { ResponseAnswer } from "../../domain/workflow.js";
// The Scoring Bot adapter's seam, through its public entry point: turn a
// submitted Response into persisted results (Score Observation + Flags).
import { scoreResponse } from "../index.js";

// ADR-0004 + ADR-0008 + ADR-0009: the Subscription-fired Scoring Bot is a thin
// adapter over the pure scoring kernel; its persistence + idempotency are tested
// against a REAL Medplum test project, never a mock. Without credentials the
// suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Scoring Bot persistence: MEDPLUM_* not set. " +
      "Provision a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

/** Codes of the two PHQ-9 Triggers (v1), for asserting which Flag was raised. */
const SEVERITY_TRIGGER = "phq9-moderate-or-above";
const ACUTE_RISK_TRIGGER = "phq9-item-9-acute-risk";

describeIntegration(
  "Scoring Bot seam: persist Score & Flags (ADR-0004/0009)",
  () => {
    let medplum: MedplumClient;
    let questionnaireRef: string;
    const patients: string[] = [];

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      await seedInstrument(medplum, PHQ9);
      const questionnaire = await medplum.searchOne("Questionnaire", {
        url: PHQ9.questionnaireUrl,
      });
      questionnaireRef = `Questionnaire/${questionnaire!.id}`;
    });

    afterAll(async () => {
      if (!medplum) return;
      for (const patientId of patients) {
        for (const type of ["Observation", "QuestionnaireResponse"] as const) {
          const found = await medplum
            .searchResources(type, { subject: `Patient/${patientId}` })
            .catch(() => []);
          for (const r of found) {
            if (r.id) await medplum.deleteResource(type, r.id).catch(() => {});
          }
        }
        const tasks = await medplum
          .searchResources("Task", { patient: `Patient/${patientId}` })
          .catch(() => []);
        for (const t of tasks) {
          if (t.id) await medplum.deleteResource("Task", t.id).catch(() => {});
        }
        await medplum.deleteResource("Patient", patientId).catch(() => {});
      }
    });

    /**
     * Persist a submitted Response for a fresh patient with the given answers,
     * returning the created `QuestionnaireResponse` - the event a Subscription
     * would hand the Scoring Bot.
     */
    async function submittedResponse(
      answers: ResponseAnswer[]
    ): Promise<QuestionnaireResponse> {
      const patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["Scoring"], family: "Seam-Test" }],
      });
      patients.push(patient.id!);
      const assignment = await createAssignment(medplum, {
        patientId: patient.id!,
        instrumentKey: PHQ9.key,
        questionnaireRef,
      });
      return medplum.createResource(
        toQuestionnaireResponse(PHQ9, {
          patientId: patient.id!,
          assignmentId: assignment.id,
          answers,
          authoredOn: "2026-07-15T09:00:00.000Z",
        })
      );
    }

    /** Every item answered `not-at-all` (total 0) - the no-Trigger baseline. */
    function allNotAtAll(): ResponseAnswer[] {
      return PHQ9.items.map((item) => ({
        linkId: item.linkId,
        answerCode: "not-at-all",
      }));
    }

    /** Set one item's answer, starting from the all-`not-at-all` baseline. */
    function withAnswers(overrides: Record<string, string>): ResponseAnswer[] {
      return allNotAtAll().map((a) =>
        overrides[a.linkId] ? { ...a, answerCode: overrides[a.linkId]! } : a
      );
    }

    it("always writes the Score Observation, even when no Trigger fires (FR-32)", async () => {
      const qr = await submittedResponse(allNotAtAll());

      const outcome = await scoreResponse(medplum, qr);

      expect(outcome.score.total).toBe(0);
      expect(outcome.flags).toHaveLength(0);
      expect(outcome.observations).toHaveLength(1);
      expect(outcome.observations[0]!.value).toBe(0);
      expect(outcome.observations[0]!.code).toBe(PHQ9.totalScore.code);
      // The Observation is really persisted and derives from this Response.
      const obs = await medplum.readResource(
        "Observation",
        outcome.observations[0]!.id
      );
      expect(obs.derivedFrom?.[0]?.reference).toBe(
        `QuestionnaireResponse/${qr.id}`
      );
    });

    it("raises a severity-band Flag when the total reaches the cutoff (FR-18)", async () => {
      // Items 1-4 at nearly-every-day = 12 (>= 10); Item 9 stays not-at-all.
      const qr = await submittedResponse(
        withAnswers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
          "phq9-item-4": "nearly-every-day",
        })
      );

      const outcome = await scoreResponse(medplum, qr);

      expect(outcome.score.total).toBe(12);
      expect(outcome.flags).toHaveLength(1);
      const flag = outcome.flags[0]!;
      expect(flag.status).toBe("Open");
      expect(flag.priority).toBe("urgent");
      expect(flag.triggerCodes).toContain(SEVERITY_TRIGGER);
      // authoredOn = the Response submission time (KPI-computable, NFR-1).
      expect(flag.createdAt).toBe(qr.authored);
    });

    it("raises an acute-risk Flag on Item 9, independent of the total (FR-20)", async () => {
      // Only Item 9 positive: total 1 (< 10) so the severity band does NOT fire.
      const qr = await submittedResponse(
        withAnswers({ "phq9-item-9": "several-days" })
      );

      const outcome = await scoreResponse(medplum, qr);

      expect(outcome.score.total).toBe(1);
      expect(outcome.flags).toHaveLength(1);
      expect(outcome.flags[0]!.priority).toBe("acute-risk");
      expect(outcome.flags[0]!.triggerCodes).toContain(ACUTE_RISK_TRIGGER);
    });

    it("raises a Flag per fired Trigger, each recording its Trigger (FR-21, FR-22)", async () => {
      // Total >= 10 AND Item 9 positive: both Triggers fire -> two Flags.
      const qr = await submittedResponse(
        withAnswers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
          "phq9-item-4": "nearly-every-day",
          "phq9-item-9": "several-days",
        })
      );

      const outcome = await scoreResponse(medplum, qr);

      expect(outcome.score.total).toBe(13);
      const codes = outcome.flags.flatMap((f) => f.triggerCodes).sort();
      expect(codes).toEqual([ACUTE_RISK_TRIGGER, SEVERITY_TRIGGER].sort());
      expect(outcome.flags).toHaveLength(2);
    });

    it("re-asserts Assignment completion on the score path (ADR-0009 recovery)", async () => {
      // The QR is created directly here (the submit fast path is not exercised),
      // so its Assignment is still Pending - the recovery the Scoring Bot covers.
      const qr = await submittedResponse(allNotAtAll());
      const assignmentId = qr.basedOn![0]!.reference!.replace("Task/", "");
      expect((await getAssignment(medplum, assignmentId)).status).toBe(
        "Pending"
      );

      await scoreResponse(medplum, qr);

      expect((await getAssignment(medplum, assignmentId)).status).toBe(
        "Completed"
      );
    });

    it("is idempotent under redelivery: no duplicate Observation or Flags", async () => {
      const qr = await submittedResponse(
        withAnswers({
          "phq9-item-1": "nearly-every-day",
          "phq9-item-2": "nearly-every-day",
          "phq9-item-3": "nearly-every-day",
          "phq9-item-4": "nearly-every-day",
          "phq9-item-9": "several-days",
        })
      );
      const patientId = qr.subject!.reference!.replace("Patient/", "");

      const first = await scoreResponse(medplum, qr);
      const second = await scoreResponse(medplum, qr); // at-least-once redelivery

      // Same resources returned both times - the conditional creates found the
      // existing ones rather than writing duplicates.
      expect(second.observations.map((o) => o.id)).toEqual(
        first.observations.map((o) => o.id)
      );
      expect(second.flags.map((f) => f.id).sort()).toEqual(
        first.flags.map((f) => f.id).sort()
      );

      // And the store agrees: exactly one Observation and two Flag Tasks persist.
      const observations = await medplum.searchResources("Observation", {
        "derived-from": `QuestionnaireResponse/${qr.id}`,
      });
      expect(observations).toHaveLength(1);
      const flagTasks = await medplum.searchResources("Task", {
        patient: `Patient/${patientId}`,
        code: `${CS_TASK_CODE}|${TASK_CODE_FLAG}`,
      });
      expect(flagTasks).toHaveLength(2);
    });
  }
);

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReference, type MedplumClient } from "@medplum/core";
import type {
  Patient,
  Practitioner,
  QuestionnaireResponse,
} from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../../../packages/test-harness/client.js";
import { loadMedplumTestConfig } from "../../../../packages/test-harness/config.js";
import {
  seedCodeSystems,
  seedInstrument,
} from "../../../../packages/instrument/seed.js";
import { PHQ9 } from "../../../../packages/instrument/phq9.js";
import { toQuestionnaireResponse } from "../../../../packages/instrument/index.js";
import { createAssignment } from "../../../../packages/assignment/index.js";
import {
  scoreResponse,
  type ScoringOutcome,
} from "../../../../packages/scoring/index.js";
import { resolve } from "../../../../packages/worklist/index.js";
import type { ResponseAnswer } from "../../../../packages/domain/workflow.js";
import { loadPatientTimeline } from "./timelineData.js";

// ADR-0008: the Coordinator app's patient-timeline composition is exercised
// end-to-end (submit + score a mix of flagged and unflagged Responses via the
// Scoring Bot -> read the Responses, Scores, and Flags back through the owning
// modules -> compose the FR-33 history) against a REAL Medplum - the one place
// the whole read path runs. It proves the never-flagged Response (FR-32 low-score
// / no-Trigger case, review Scenario 1) is now visible, the timeline is
// reverse-chronological, and each row carries the right Score/band/Flag status.
// Without credentials the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING patient timeline composition: MEDPLUM_* not set. " +
      "Provision a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

// Three submission times, oldest to newest, so the expected timeline order
// ([newest, ..., oldest]) is unambiguous and independent of write order.
const T_UNFLAGGED = "2026-07-10T09:00:00.000Z";
const T_OPEN = "2026-07-12T09:00:00.000Z";
const T_RESOLVED = "2026-07-14T09:00:00.000Z";

describeIntegration(
  "Patient timeline: compose the FR-33 assessment history (ADR-0008)",
  () => {
    let medplum: MedplumClient;
    let coordinator: Practitioner;
    let patient: Patient;
    let questionnaireRef: string;

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      await seedInstrument(medplum, PHQ9);
      const questionnaire = await medplum.searchOne("Questionnaire", {
        url: PHQ9.questionnaireUrl,
      });
      questionnaireRef = `Questionnaire/${questionnaire!.id}`;
      coordinator = await medplum.createResource<Practitioner>({
        resourceType: "Practitioner",
        name: [{ given: ["Timeline"], family: "Coordinator" }],
      });
      patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["Tessa"], family: "Timeline-Test" }],
      });
    });

    afterAll(async () => {
      if (!medplum) return;
      for (const type of ["Observation", "QuestionnaireResponse"] as const) {
        const found = await medplum
          .searchResources(type, { subject: `Patient/${patient.id}` })
          .catch(() => []);
        for (const r of found) {
          if (r.id) await medplum.deleteResource(type, r.id).catch(() => {});
        }
      }
      const tasks = await medplum
        .searchResources("Task", { patient: `Patient/${patient.id}` })
        .catch(() => []);
      for (const t of tasks) {
        if (t.id) await medplum.deleteResource("Task", t.id).catch(() => {});
      }
      if (coordinator?.id) {
        await medplum
          .deleteResource("Practitioner", coordinator.id)
          .catch(() => {});
      }
      await medplum.deleteResource("Patient", patient.id!).catch(() => {});
    });

    /** All items `not-at-all` (total 0) except the ones raised to the given code. */
    function answers(raised: Record<string, string>): ResponseAnswer[] {
      return PHQ9.items.map((item) => ({
        linkId: item.linkId,
        answerCode: raised[item.linkId] ?? "not-at-all",
      }));
    }

    async function submitAndScore(
      authoredOn: string,
      raised: Record<string, string>
    ): Promise<{ qr: QuestionnaireResponse; outcome: ScoringOutcome }> {
      const assignment = await createAssignment(medplum, {
        patientId: patient.id!,
        instrumentKey: PHQ9.key,
        questionnaireRef,
      });
      const qr = await medplum.createResource(
        toQuestionnaireResponse(PHQ9, {
          patientId: patient.id!,
          assignmentId: assignment.id,
          answers: answers(raised),
          authoredOn,
        })
      );
      const outcome = await scoreResponse(medplum, qr);
      return { qr, outcome };
    }

    it("lists completed Responses newest-first with the right Score, band, and Flag status - including the never-flagged one (FR-32/FR-33)", async () => {
      // 1) An all-`not-at-all` Response: total 0, none-minimal band, NO Flag. This
      //    is the FR-32 low-score case that was captured yet invisible until now.
      const { qr: unflagged } = await submitAndScore(T_UNFLAGGED, {});

      // 2) Items 1-5 nearly-every-day (total 15): the severity-band Trigger fires
      //    (non-acute), leaving one Open Flag; Item 9 stays not-at-all.
      const { qr: open } = await submitAndScore(T_OPEN, {
        "phq9-item-1": "nearly-every-day",
        "phq9-item-2": "nearly-every-day",
        "phq9-item-3": "nearly-every-day",
        "phq9-item-4": "nearly-every-day",
        "phq9-item-5": "nearly-every-day",
      });

      // 3) Items 1-4 nearly-every-day + Item 9 positive (total 13): both Triggers
      //    fire -> one acute-risk Flag, which a coordinator then resolves. Its row
      //    must still show in the timeline (off the Worklist, retained; FR-30).
      const { qr: resolved, outcome } = await submitAndScore(T_RESOLVED, {
        "phq9-item-1": "nearly-every-day",
        "phq9-item-2": "nearly-every-day",
        "phq9-item-3": "nearly-every-day",
        "phq9-item-4": "nearly-every-day",
        "phq9-item-9": "several-days",
      });
      await resolve(
        medplum,
        outcome.flags[0]!.id,
        { reason: "no-action-needed" },
        createReference(coordinator).reference!
      );

      const timeline = await loadPatientTimeline(medplum, patient.id!);

      // Reverse-chronological: newest (resolved) first, never-flagged (oldest) last.
      expect(timeline.map((r) => r.responseId)).toEqual([
        resolved.id,
        open.id,
        unflagged.id,
      ]);

      const byId = new Map(timeline.map((r) => [r.responseId, r]));

      const unflaggedRow = byId.get(unflagged.id!)!;
      expect(unflaggedRow.instrumentTitle).toBe(PHQ9.title);
      expect(unflaggedRow.submittedAt).toBe(T_UNFLAGGED);
      expect(unflaggedRow.total).toBe(0);
      expect(unflaggedRow.band?.code).toBe("none-minimal");
      expect(unflaggedRow.flagStatus).toBeUndefined();

      const openRow = byId.get(open.id!)!;
      expect(openRow.total).toBe(15);
      expect(openRow.band?.code).toBe("moderately-severe");
      expect(openRow.flagStatus).toBe("Open");

      const resolvedRow = byId.get(resolved.id!)!;
      expect(resolvedRow.total).toBe(13);
      expect(resolvedRow.band?.code).toBe("moderate");
      expect(resolvedRow.flagStatus).toBe("Resolved");
    });

    it("returns an empty history for a patient with no Responses", async () => {
      const stranger = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["No"], family: "History" }],
      });
      try {
        expect(await loadPatientTimeline(medplum, stranger.id!)).toEqual([]);
      } finally {
        await medplum.deleteResource("Patient", stranger.id!).catch(() => {});
      }
    });
  }
);

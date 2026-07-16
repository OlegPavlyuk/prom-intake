import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient, QuestionnaireResponse } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../../../packages/test-harness/client.js";
import { loadMedplumTestConfig } from "../../../../packages/test-harness/config.js";
import {
  seedCodeSystems,
  seedInstrument,
} from "../../../../packages/instrument/seed.js";
import { PHQ9 } from "../../../../packages/instrument/phq9.js";
import { toQuestionnaireResponse } from "../../../../packages/instrument/index.js";
import { createAssignment } from "../../../../packages/assignment/index.js";
import { scoreResponse } from "../../../../packages/scoring/index.js";
import type { ResponseAnswer } from "../../../../packages/domain/workflow.js";
import { getFlagDetail, loadWorklist } from "./worklistData.js";

// ADR-0008: the Coordinator app's Flag-detail composition is exercised
// end-to-end (raise Flags via the Scoring Bot -> read the Flag, Response, Score,
// and Instrument config back through the owning modules -> compose the FR-29
// signal) against a REAL Medplum - the one place the whole read path runs.
// Ordering itself is unit-covered by PriorityPolicy (#20) and list loading by the
// Worklist seam; this asserts the detail composes the clinical signal correctly.
// Without credentials the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Flag detail composition: MEDPLUM_* not set. " +
      "Provision a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

const SUBMITTED_AT = "2026-07-15T09:30:00.000Z";

describeIntegration("Flag detail: compose the FR-29 signal (ADR-0008)", () => {
  let medplum: MedplumClient;
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
    patient = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Dana"], family: "Detail-Test" }],
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
    await medplum.deleteResource("Patient", patient.id!).catch(() => {});
  });

  /** Total 13 (items 1-4 nearly-every-day) with Item 9 positive: both Triggers fire. */
  function answers(): ResponseAnswer[] {
    return PHQ9.items.map((item) => {
      if (
        ["phq9-item-1", "phq9-item-2", "phq9-item-3", "phq9-item-4"].includes(
          item.linkId
        )
      ) {
        return { linkId: item.linkId, answerCode: "nearly-every-day" };
      }
      if (item.linkId === "phq9-item-9") {
        return { linkId: item.linkId, answerCode: "several-days" };
      }
      return { linkId: item.linkId, answerCode: "not-at-all" };
    });
  }

  async function submitAndScore(): Promise<QuestionnaireResponse> {
    const assignment = await createAssignment(medplum, {
      patientId: patient.id!,
      instrumentKey: PHQ9.key,
      questionnaireRef,
    });
    const qr = await medplum.createResource(
      toQuestionnaireResponse(PHQ9, {
        patientId: patient.id!,
        assignmentId: assignment.id,
        answers: answers(),
        authoredOn: SUBMITTED_AT,
      })
    );
    await scoreResponse(medplum, qr);
    return qr;
  }

  it("composes patient, Instrument, score+band, fired Triggers, and item answers (FR-29)", async () => {
    await submitAndScore();

    // Locate this patient's acute-risk Flag through the shared Worklist.
    const rows = await loadWorklist(medplum);
    const acute = rows.find(
      (r) => r.flag.patientId === patient.id && r.flag.priority === "acute-risk"
    );
    expect(acute).toBeDefined();
    expect(acute!.patientName).toBe("Dana Detail-Test");

    const detail = await getFlagDetail(medplum, acute!.flag.id);

    // Patient identity, Instrument, and submission time.
    expect(detail.patientName).toBe("Dana Detail-Test");
    expect(detail.instrumentTitle).toBe(PHQ9.title);
    expect(detail.submittedAt).toBe(SUBMITTED_AT);

    // Total Score + severity band (13 -> Moderate for PHQ-9).
    expect(detail.total).toBe(13);
    expect(detail.band?.code).toBe("moderate");

    // Which Trigger(s) fired - this Flag is the acute-risk one, highlighted.
    expect(detail.triggers).toHaveLength(1);
    expect(detail.triggers[0]!.code).toBe("phq9-item-9-acute-risk");
    expect(detail.triggers[0]!.acuteRisk).toBe(true);
    expect(detail.triggers[0]!.label).toMatch(/item 9/i);

    // Item-level answers, in Instrument order, with the acute-risk item flagged.
    expect(detail.answers).toHaveLength(PHQ9.items.length);
    const item9 = detail.answers.find((a) => a.linkId === "phq9-item-9")!;
    expect(item9.acuteRisk).toBe(true);
    expect(item9.answerLabel).toBe("Several days");
    expect(item9.weight).toBe(1);
    // A non-acute item reads its own answer, not Item 9's.
    const item1 = detail.answers.find((a) => a.linkId === "phq9-item-1")!;
    expect(item1.acuteRisk).toBe(false);
    expect(item1.answerLabel).toBe("Nearly every day");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
import { seedInstrument } from "../../instrument/seed.js";
import { PHQ9 } from "../../instrument/phq9.js";
// The Assignment module's seam, exercised through its public entry point.
import {
  ASSIGNMENT_TTL_DAYS,
  completeAssignment,
  createAssignment,
  expireAssignment,
  findAssignmentsByPatient,
  getAssignment,
} from "../index.js";

// ADR-0008: the Assignment lifecycle seam is tested against a REAL Medplum test
// project, never a mock. Without credentials the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Assignment lifecycle: MEDPLUM_* not set. Provision " +
      "a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

describeIntegration("Assignment seam: lifecycle transitions (ADR-0008)", () => {
  let medplum: MedplumClient;
  let patientId: string;
  let questionnaireRef: string;
  const created: string[] = []; // assignment ids to clean up
  let patient: Patient;

  beforeAll(async () => {
    medplum = await createTestMedplumClient(config!);
    await seedCodeSystems(medplum);
    await seedInstrument(medplum, PHQ9);

    patient = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Assignment"], family: "Seam-Test" }],
    });
    patientId = patient.id!;

    const questionnaire = await medplum.searchOne("Questionnaire", {
      url: PHQ9.questionnaireUrl,
    });
    questionnaireRef = `Questionnaire/${questionnaire!.id}`;
  });

  afterAll(async () => {
    if (!medplum) return;
    for (const id of created) {
      await medplum.deleteResource("Task", id).catch(() => undefined);
    }
    if (patient?.id) {
      await medplum
        .deleteResource("Patient", patient.id)
        .catch(() => undefined);
    }
  });

  async function assign(now?: Date): Promise<string> {
    const a = await createAssignment(
      medplum,
      { patientId, instrumentKey: PHQ9.key, questionnaireRef },
      now ? { now } : undefined
    );
    created.push(a.id);
    return a.id;
  }

  it("creates a Pending Assignment for the patient with a 14-day deadline", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const a = await createAssignment(
      medplum,
      { patientId, instrumentKey: PHQ9.key, questionnaireRef },
      { now }
    );
    created.push(a.id);

    expect(a.status).toBe("Pending");
    expect(a.patientId).toBe(patientId);
    expect(a.instrumentKey).toBe(PHQ9.key);
    expect(new Date(a.deadline).getTime() - now.getTime()).toBe(
      ASSIGNMENT_TTL_DAYS * DAY_MS
    );

    // The created Assignment round-trips through the module unchanged.
    const got = await getAssignment(medplum, a.id);
    expect(got).toEqual(a);
  });

  it("transitions Pending -> Completed", async () => {
    const id = await assign();
    const completed = await completeAssignment(medplum, id);
    expect(completed.status).toBe("Completed");
    expect((await getAssignment(medplum, id)).status).toBe("Completed");
  });

  it("transitions Pending -> Expired", async () => {
    const id = await assign();
    const expired = await expireAssignment(medplum, id);
    expect(expired.status).toBe("Expired");
    expect((await getAssignment(medplum, id)).status).toBe("Expired");
  });

  it("rejects an illegal transition (completing an Expired Assignment)", async () => {
    const id = await assign();
    await expireAssignment(medplum, id);
    await expect(completeAssignment(medplum, id)).rejects.toThrow(
      /transition/i
    );
  });

  it("queries a patient's Assignments and filters by status", async () => {
    // A fresh patient isolates the count from other tests.
    const p = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Query"], family: "Seam-Test" }],
    });
    const mine = async (status?: "Pending" | "Completed" | "Expired") =>
      findAssignmentsByPatient(medplum, p.id!, status ? { status } : undefined);

    const pendingA = await createAssignment(medplum, {
      patientId: p.id!,
      instrumentKey: PHQ9.key,
      questionnaireRef,
    });
    const toComplete = await createAssignment(medplum, {
      patientId: p.id!,
      instrumentKey: PHQ9.key,
      questionnaireRef,
    });
    created.push(pendingA.id, toComplete.id);
    await completeAssignment(medplum, toComplete.id);

    // Reissue (FR-10) is just create-again: two distinct Assignments coexist.
    const all = await mine();
    expect(all.map((a) => a.id).sort()).toEqual(
      [pendingA.id, toComplete.id].sort()
    );

    const completedOnly = await mine("Completed");
    expect(completedOnly.map((a) => a.id)).toEqual([toComplete.id]);
    const pendingOnly = await mine("Pending");
    expect(pendingOnly.map((a) => a.id)).toEqual([pendingA.id]);

    await medplum.deleteResource("Patient", p.id!).catch(() => undefined);
  });

  it("raises a domain error for an unknown Assignment id", async () => {
    await expect(
      getAssignment(medplum, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(/not found/i);
  });
});

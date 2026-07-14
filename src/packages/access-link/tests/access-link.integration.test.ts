import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
import { seedInstrument } from "../../instrument/seed.js";
import { PHQ9 } from "../../instrument/phq9.js";
import { createAssignment } from "../../assignment/index.js";
import type { Assignment } from "../../domain/workflow.js";
// The Access-link module's seam, exercised through its public entry point.
import { issueAccessLink, validateAccessLink } from "../index.js";

// ADR-0008 + ADR-0005: the Access-link seam - the highest-risk boundary in v1 -
// is tested against a REAL Medplum test project, never a mock.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Access-link issue/validate: MEDPLUM_* not set.\n"
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

describeIntegration("Access-link seam: issue + validate (ADR-0005)", () => {
  let medplum: MedplumClient;
  let questionnaireRef: string;
  const patients: string[] = [];
  const tasks: string[] = [];

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
      const tokens = await medplum
        .searchResources("Basic", { subject: `Patient/${patientId}` })
        .catch(() => []);
      for (const t of tokens) {
        if (t.id) await medplum.deleteResource("Basic", t.id).catch(() => {});
      }
    }
    for (const id of tasks) {
      await medplum.deleteResource("Task", id).catch(() => {});
    }
    for (const id of patients) {
      await medplum.deleteResource("Patient", id).catch(() => {});
    }
  });

  /** Create a fresh patient + Pending Assignment to bind a link to. */
  async function anAssignment(now?: Date): Promise<Assignment> {
    const patient = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Access"], family: "Link-Test" }],
    });
    patients.push(patient.id!);
    const assignment = await createAssignment(
      medplum,
      { patientId: patient.id!, instrumentKey: PHQ9.key, questionnaireRef },
      now ? { now } : undefined
    );
    tasks.push(assignment.id);
    return assignment;
  }

  it("issues a link whose raw token validates to the bound Assignment/Patient/Questionnaire", async () => {
    const assignment = await anAssignment();
    const issued = await issueAccessLink(
      medplum,
      assignment,
      PHQ9.questionnaireUrl
    );

    expect(typeof issued.token).toBe("string");
    expect(issued.token.length).toBeGreaterThanOrEqual(32); // high entropy
    expect(issued.binding).toEqual({
      assignmentId: assignment.id,
      patientId: assignment.patientId,
      questionnaireUrl: PHQ9.questionnaireUrl,
    });
    // The link expiry mirrors the Assignment deadline (FR-7, one config value).
    expect(issued.expiresAt).toBe(assignment.deadline);

    const validation = await validateAccessLink(medplum, issued.token);
    expect(validation).toEqual({
      status: "valid",
      assignmentId: assignment.id,
      patientId: assignment.patientId,
      questionnaireUrl: PHQ9.questionnaireUrl,
    });
  });

  it("stores only a hash - the raw token never touches the datastore (ADR-0005)", async () => {
    const assignment = await anAssignment();
    const issued = await issueAccessLink(
      medplum,
      assignment,
      PHQ9.questionnaireUrl
    );

    // The persisted token record must not contain the raw secret anywhere; a
    // datastore leak must yield no working link. Validation still resolves the
    // token, proving lookup is by hash of the presented value.
    const stored = await medplum.searchResources("Basic", {
      subject: `Patient/${assignment.patientId}`,
    });
    expect(stored.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored)).not.toContain(issued.token);

    expect((await validateAccessLink(medplum, issued.token)).status).toBe(
      "valid"
    );
  });

  it("rejects an unknown or tampered token as not-found", async () => {
    const assignment = await anAssignment();
    const issued = await issueAccessLink(
      medplum,
      assignment,
      PHQ9.questionnaireUrl
    );

    expect((await validateAccessLink(medplum, "not-a-real-token")).status).toBe(
      "not-found"
    );
    expect((await validateAccessLink(medplum, `${issued.token}x`)).status).toBe(
      "not-found"
    );
  });

  it("treats a link past its expiry as expired, not valid (FR-7)", async () => {
    const t0 = new Date("2026-07-14T12:00:00.000Z");
    const assignment = await anAssignment(t0);
    const issued = await issueAccessLink(
      medplum,
      assignment,
      PHQ9.questionnaireUrl,
      { now: t0 }
    );
    expect(new Date(issued.expiresAt).getTime() - t0.getTime()).toBe(
      14 * DAY_MS
    );

    const before = new Date(t0.getTime() + 13 * DAY_MS);
    const after = new Date(t0.getTime() + 15 * DAY_MS);
    expect(
      (await validateAccessLink(medplum, issued.token, { now: before })).status
    ).toBe("valid");
    expect(
      (await validateAccessLink(medplum, issued.token, { now: after })).status
    ).toBe("expired");
  });

  it("mints a distinct token on each issue (reissue = a fresh link; FR-10)", async () => {
    const assignment = await anAssignment();
    const a = await issueAccessLink(medplum, assignment, PHQ9.questionnaireUrl);
    const b = await issueAccessLink(medplum, assignment, PHQ9.questionnaireUrl);
    expect(a.token).not.toBe(b.token);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../../../packages/test-harness/client.js";
import { loadMedplumTestConfig } from "../../../../packages/test-harness/config.js";
import {
  seedCodeSystems,
  seedInstrument,
} from "../../../../packages/instrument/seed.js";
import { PHQ9 } from "../../../../packages/instrument/phq9.js";
import { validateAccessLink } from "../../../../packages/access-link/index.js";
import { findAssignmentsByPatient } from "../../../../packages/assignment/index.js";
import { assignInstrument } from "./assignInstrument.js";

// ADR-0008: the Coordinator app's assign orchestration is exercised end-to-end
// (loadInstrument -> resolve Questionnaire -> createAssignment -> issueAccessLink
// -> assemble URL) against a REAL Medplum, the one place the whole path runs -
// MockClient cannot model loadInstrument's Basic token search, so the UI seam
// injects this. This is the DoD's "end-to-end assign -> link" path in code.
// Without credentials the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING assign orchestration: MEDPLUM_* not set. Provision " +
      "a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

const PATIENT_APP_BASE_URL = "https://patient.example/";
const DAY_MS = 24 * 60 * 60 * 1000;

function tokenOf(accessLinkUrl: string): string {
  return new URL(accessLinkUrl).searchParams.get("token") ?? "";
}

describeIntegration("Assign orchestration: assign -> link (ADR-0008)", () => {
  let medplum: MedplumClient;
  let patient: Patient;

  beforeAll(async () => {
    medplum = await createTestMedplumClient(config!);
    await seedCodeSystems(medplum);
    await seedInstrument(medplum, PHQ9);
    patient = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Assign"], family: "Orchestration-Test" }],
    });
  });

  afterAll(async () => {
    if (!medplum) return;
    for (const a of await findAssignmentsByPatient(medplum, patient.id!)) {
      await medplum.deleteResource("Task", a.id).catch(() => undefined);
    }
    await medplum.deleteResource("Patient", patient.id!).catch(() => undefined);
  });

  it("assigns PHQ-9 and mints a valid, deliverable Access link", async () => {
    const now = new Date();
    const result = await assignInstrument(medplum, {
      patientId: patient.id!,
      patientAppBaseUrl: PATIENT_APP_BASE_URL,
    });

    // The delivery URL is assembled from the app's base + the raw token.
    expect(
      result.accessLinkUrl.startsWith(`${PATIENT_APP_BASE_URL}?token=`)
    ).toBe(true);
    expect(result.instrumentTitle).toBe(PHQ9.title);
    // Link expiry is the 14-day Assignment deadline (FR-7).
    expect(
      new Date(result.expiresAt).getTime() - now.getTime()
    ).toBeGreaterThan(13 * DAY_MS);

    // A Pending Assignment now exists for the patient (FR-5, FR-9).
    const assignments = await findAssignmentsByPatient(medplum, patient.id!, {
      status: "Pending",
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.instrumentKey).toBe(PHQ9.key);

    // The token embedded in the delivered URL resolves to this patient's
    // Instrument - a real assign -> link round-trip, not just a string.
    const validation = await validateAccessLink(
      medplum,
      tokenOf(result.accessLinkUrl)
    );
    expect(validation.status).toBe("valid");
    if (validation.status === "valid") {
      expect(validation.patientId).toBe(patient.id);
      expect(validation.questionnaireUrl).toBe(PHQ9.questionnaireUrl);
    }
  });

  it("reissues a distinct Assignment and link on a second assign (FR-10)", async () => {
    const p = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Reissue"], family: "Orchestration-Test" }],
    });

    const first = await assignInstrument(medplum, {
      patientId: p.id!,
      patientAppBaseUrl: PATIENT_APP_BASE_URL,
    });
    const second = await assignInstrument(medplum, {
      patientId: p.id!,
      patientAppBaseUrl: PATIENT_APP_BASE_URL,
    });

    // Reissue = a fresh Assignment + fresh token, no separate resend path.
    expect(tokenOf(second.accessLinkUrl)).not.toBe(
      tokenOf(first.accessLinkUrl)
    );
    const pending = await findAssignmentsByPatient(medplum, p.id!, {
      status: "Pending",
    });
    expect(pending).toHaveLength(2);

    // Both links independently resolve.
    for (const link of [first, second]) {
      const v = await validateAccessLink(medplum, tokenOf(link.accessLinkUrl));
      expect(v.status).toBe("valid");
    }

    for (const a of pending) {
      await medplum.deleteResource("Task", a.id).catch(() => undefined);
    }
    await medplum.deleteResource("Patient", p.id!).catch(() => undefined);
  });
});

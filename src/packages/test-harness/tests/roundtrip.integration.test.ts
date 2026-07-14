import { beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../client.js";
import { loadMedplumTestConfig } from "../config.js";

// ADR-0008: Medplum is a core dependency, so this seam round-trips a resource
// against a REAL Medplum test project - never a mock. When credentials are
// absent (a dev box without Medplum, or an untrusted fork PR) the suite skips
// loudly rather than reporting a false green.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING real-Medplum round-trip: MEDPLUM_BASE_URL / " +
      "MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET not set. Provision a test " +
      "project first - see docs/architecture/infrastructure.md.\n"
  );
}

describeIntegration("real-Medplum harness round-trip (ADR-0008)", () => {
  let medplum: MedplumClient;

  beforeAll(async () => {
    // config is non-null inside this block (describe is skipped otherwise).
    medplum = await createTestMedplumClient(config!);
  });

  it("creates a resource and reads it back", async () => {
    const created = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ family: "Harness", given: ["Roundtrip"] }],
    });
    expect(created.id).toBeDefined();

    const readBack = await medplum.readResource("Patient", created.id!);
    expect(readBack.id).toBe(created.id);
    expect(readBack.name?.[0]?.family).toBe("Harness");

    // Keep the test project tidy across runs.
    await medplum.deleteResource("Patient", created.id!);
  });
});

/**
 * Seed a Medplum project with the baseline the app needs to be usable: the
 * project-owned CodeSystems, the shipped Instrument(s), and the synthetic
 * patients a coordinator can assign to straight away. Idempotent throughout
 * (upserts keyed on canonical url / instrument key / exact patient name), so it
 * is safe to re-run.
 *
 * This is the one seed path: `dev:full` runs it for the local environment and
 * `reset-hosted.ts` runs it for the public demo, so the two start from the same
 * baseline - and the demo's synthetic patients are restored by every reset
 * rather than being hand-made data a deploy would wipe (ADR-0012).
 *
 * Usage (after `npm run medplum:provision` has written .env):
 *   npm run medplum:seed
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createTestMedplumClient } from "../src/packages/test-harness/client.js";
import { requireMedplumTestConfig } from "../src/packages/test-harness/config.js";
import {
  seedCodeSystems,
  seedInstrument,
} from "../src/packages/instrument/seed.js";
import { PHQ9 } from "../src/packages/instrument/phq9.js";
import {
  seedSyntheticPatients,
  SYNTHETIC_PATIENTS,
} from "./synthetic-patients.js";

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }

  const medplum = await createTestMedplumClient(requireMedplumTestConfig());
  await seedCodeSystems(medplum);
  await seedInstrument(medplum, PHQ9);
  await seedSyntheticPatients(medplum);

  console.log(
    `Seeded project CodeSystems, PHQ-9 and ${SYNTHETIC_PATIENTS.length} synthetic patients into the Medplum project.`
  );
}

main().catch((err) => {
  console.error("\nSeeding failed:", err);
  process.exit(1);
});

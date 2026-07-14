/**
 * Seed the project-owned CodeSystems and the shipped Instrument(s) into the
 * Medplum test project so downstream tickets and `/verify` have PHQ-9 reference
 * data present. Idempotent (upserts keyed on canonical url / instrument key), so
 * it is safe to re-run.
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

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }

  const medplum = await createTestMedplumClient(requireMedplumTestConfig());
  await seedCodeSystems(medplum);
  await seedInstrument(medplum, PHQ9);

  console.log(
    "Seeded project CodeSystems and PHQ-9 into the Medplum test project."
  );
}

main().catch((err) => {
  console.error("\nSeeding failed:", err);
  process.exit(1);
});

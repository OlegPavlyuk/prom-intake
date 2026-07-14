import { MedplumClient } from "@medplum/core";
import type { MedplumTestConfig } from "./config.js";

// The harness hides Medplum-client construction + authentication behind one
// call so every later ticket's integration tests get an authenticated client
// the same way (ADR-0008). Callers never wire up auth themselves.

/**
 * Build a MedplumClient authenticated against the test project via the
 * client-credentials grant.
 */
export async function createTestMedplumClient(
  config: MedplumTestConfig
): Promise<MedplumClient> {
  const medplum = new MedplumClient({ baseUrl: config.baseUrl });
  await medplum.startClientLogin(config.clientId, config.clientSecret);
  return medplum;
}

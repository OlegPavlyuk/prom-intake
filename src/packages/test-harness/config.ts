// Configuration seam for the real-Medplum integration harness (ADR-0008).
// Credentials are supplied via environment (client-credentials for a Medplum
// test project), never committed. See docs/architecture/infrastructure.md.

export interface MedplumTestConfig {
  /** Base URL of the Medplum test server, e.g. https://api.medplum.com/ */
  readonly baseUrl: string;
  /** ClientApplication id (client-credentials grant). */
  readonly clientId: string;
  /** ClientApplication secret. */
  readonly clientSecret: string;
}

/**
 * Read the Medplum test config from the environment. Returns `null` when any
 * value is absent so callers can skip integration work loudly rather than fail
 * opaquely.
 */
export function loadMedplumTestConfig(): MedplumTestConfig | null {
  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    return null;
  }
  return { baseUrl, clientId, clientSecret };
}

/**
 * Like {@link loadMedplumTestConfig} but throws a descriptive error when the
 * config is missing. Use where a real Medplum is mandatory (e.g. provisioning).
 */
export function requireMedplumTestConfig(): MedplumTestConfig {
  const config = loadMedplumTestConfig();
  if (!config) {
    throw new Error(
      "Real-Medplum config missing. Set MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID " +
        "and MEDPLUM_CLIENT_SECRET (see docs/architecture/infrastructure.md)."
    );
  }
  return config;
}

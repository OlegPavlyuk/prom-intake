/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Medplum server the coordinator authenticates against. */
  readonly VITE_MEDPLUM_BASE_URL?: string;
  /**
   * Base URL of the Patient completion page (#16) used to assemble the
   * patient-facing Access-link URL from an issued token (ADR-0010 delivery layer).
   */
  readonly VITE_PATIENT_APP_BASE_URL?: string;
  /**
   * `"true"` builds the public-demo variant, which carries the persistent
   * "synthetic data only" banner (ADR-0012). Unset in local dev.
   */
  readonly VITE_DEMO_BANNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

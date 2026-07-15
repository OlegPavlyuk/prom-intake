/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Medplum server the coordinator authenticates against. */
  readonly VITE_MEDPLUM_BASE_URL?: string;
  /**
   * Base URL of the Patient completion page (#16) used to assemble the
   * patient-facing Access-link URL from an issued token (ADR-0010 delivery layer).
   */
  readonly VITE_PATIENT_APP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

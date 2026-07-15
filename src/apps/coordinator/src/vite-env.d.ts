/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Medplum server the coordinator authenticates against. */
  readonly VITE_MEDPLUM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

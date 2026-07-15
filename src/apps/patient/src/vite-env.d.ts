/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Medplum server (used only to construct the client). */
  readonly VITE_MEDPLUM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

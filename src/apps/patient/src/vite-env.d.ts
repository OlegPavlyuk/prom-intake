/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Medplum server (used only to construct the client). */
  readonly VITE_MEDPLUM_BASE_URL?: string;
  /**
   * URL of the Access-link `publicWebhook` Bot - the single unauthenticated
   * touchpoint for `open` + `submit` (ADR-0005). Written by
   * `npm run medplum:deploy-bots`; the only server endpoint this app calls.
   */
  readonly VITE_ACCESS_LINK_WEBHOOK_URL?: string;
  /**
   * `"true"` builds the public-demo variant, which carries the persistent
   * "synthetic data only" banner (ADR-0012). Unset in local dev.
   */
  readonly VITE_DEMO_BANNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

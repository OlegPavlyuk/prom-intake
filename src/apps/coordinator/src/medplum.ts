import { MedplumClient } from "@medplum/core";

// The single authenticated Medplum client for the coordinator app. The client
// owns session persistence and token refresh (ADR-0010 A3), so a page refresh
// restores the coordinator's session and `signOut()` ends it. It talks to
// Medplum's FHIR API directly under the coordinator's own AccessPolicy - no
// backend-for-frontend interposes.
export const medplum = new MedplumClient({
  baseUrl: import.meta.env.VITE_MEDPLUM_BASE_URL ?? "http://localhost:8103/",
});

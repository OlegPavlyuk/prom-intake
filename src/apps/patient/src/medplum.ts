import { MedplumClient } from "@medplum/core";

// The patient app's Medplum client (ADR-0010 A3): unauthenticated and
// credential-free. It exists only because `MedplumProvider`/`QuestionnaireForm`
// need one in context - no login is ever attempted, and the app has no
// SignInForm, no ProtectedRoute, and no stored session.
export const medplum = new MedplumClient({
  baseUrl: import.meta.env.VITE_MEDPLUM_BASE_URL ?? "http://localhost:8103/",
});

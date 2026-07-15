import type { MedplumClient } from "@medplum/core";
import { MantineProvider } from "@mantine/core";
import { MedplumProvider } from "@medplum/react";
import { CompletionPage } from "./completion/CompletionPage";
import {
  resolvePatientAccessLink,
  type ResolvePatientAccessLink,
} from "./completion/resolvePatientAccessLink";

export interface AppProps {
  /**
   * The Medplum client `MedplumProvider`/`QuestionnaireForm` need in context.
   * Unauthenticated and credential-free (ADR-0010 A3) - no session is ever
   * held.
   */
  readonly medplum: MedplumClient;
  /** Injectable so the UI-seam tests drive the page without a real network call. */
  readonly resolve?: ResolvePatientAccessLink;
  /** Injectable for tests; production reads the token from the page URL. */
  readonly token?: string | null;
}

// The account-less, PHI-minimal patient completion page (ADR-0010 A3): no
// SignInForm, no ProtectedRoute, no stored session. The only thing on the
// page is the one Instrument the presented token resolves to.
export function App({
  medplum,
  resolve = resolvePatientAccessLink,
  token = new URLSearchParams(window.location.search).get("token"),
}: AppProps): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <CompletionPage token={token} resolve={resolve} />
      </MantineProvider>
    </MedplumProvider>
  );
}

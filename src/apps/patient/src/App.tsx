import type { MedplumClient } from "@medplum/core";
import { MantineProvider, Stack } from "@mantine/core";
import { MedplumProvider } from "@medplum/react";
import { CompletionPage } from "./completion/CompletionPage";
import { DemoBanner } from "./demo/DemoBanner";
import {
  resolvePatientAccessLink,
  submitPatientResponse,
  type ResolvePatientAccessLink,
  type SubmitPatientResponse,
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
  /** Injectable so the UI-seam tests drive submit without a real network call. */
  readonly submit?: SubmitPatientResponse;
  /** Injectable for tests; production reads the token from the page URL. */
  readonly token?: string | null;
}

// The account-less, PHI-minimal patient completion page (ADR-0010 A3): no
// SignInForm, no ProtectedRoute, no stored session. The only thing on the
// page is the one Instrument the presented token resolves to. Its one server
// touchpoint is the Access-link publicWebhook Bot (open + submit; ADR-0005).
export function App({
  medplum,
  resolve = resolvePatientAccessLink,
  submit = submitPatientResponse,
  token = new URLSearchParams(window.location.search).get("token"),
}: AppProps): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        {/* Full-height column so the demo banner (when this is a demo build)
            takes the top strip and the page fills exactly what is left - the
            page's own centred states grow into the remaining space. */}
        <Stack gap={0} mih="100dvh">
          <DemoBanner />
          <CompletionPage token={token} resolve={resolve} submit={submit} />
        </Stack>
      </MantineProvider>
    </MedplumProvider>
  );
}

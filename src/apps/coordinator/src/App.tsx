import type { MedplumClient } from "@medplum/core";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { MedplumProvider } from "@medplum/react";
import { CoordinatorPage } from "./CoordinatorPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { theme } from "./theme";

export interface AppProps {
  /** The Medplum client that owns the coordinator's session (ADR-0010 A3). */
  readonly medplum: MedplumClient;
}

// Provider stack for the coordinator app: the Medplum auth context wraps the
// Mantine UI context (`@medplum/react` renders Mantine components), and
// `ProtectedRoute` gates the app on an authenticated session. Taking `medplum`
// as a prop keeps the tree pure - production passes the real client, tests pass
// a `MockClient` in a known session state.
export function App({ medplum }: AppProps): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <MantineProvider theme={theme}>
        <Notifications />
        <ProtectedRoute>
          <CoordinatorPage />
        </ProtectedRoute>
      </MantineProvider>
    </MedplumProvider>
  );
}

import type { ReactNode } from "react";
import { Center, Stack } from "@mantine/core";
import { SignInForm, useMedplumProfile } from "@medplum/react";
import { DemoBanner } from "./demo/DemoBanner";

export interface ProtectedRouteProps {
  readonly children: ReactNode;
}

// Gates the coordinator app on an authenticated Medplum session (FR-31, ADR-0010
// A3). `useMedplumProfile()` reflects `medplum.getProfile()` and re-renders when
// the session changes, so signing in reveals `children` and signing out returns
// here - no manual navigation. Google/IdP auth is a later config swap (ADR-0010),
// so v1 shows only Medplum's built-in email/password form.
export function ProtectedRoute({ children }: ProtectedRouteProps): ReactNode {
  const profile = useMedplumProfile();

  if (!profile) {
    // The gate is the coordinator app's other chrome (the signed-in shell is
    // `CoordinatorPage`), so it carries the demo banner too - it must be on
    // every screen, including the one a visitor lands on first.
    return (
      <Stack gap={0} mih="100dvh">
        <DemoBanner />
        <Center flex={1}>
          <SignInForm onSuccess={() => undefined} disableGoogleAuth>
            <h1>Coordinator sign in</h1>
          </SignInForm>
        </Center>
      </Stack>
    );
  }

  return children;
}

import type { ReactNode } from "react";
import { Center } from "@mantine/core";
import { SignInForm, useMedplumProfile } from "@medplum/react";

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
    return (
      <Center mih="100vh">
        <SignInForm onSuccess={() => undefined} disableGoogleAuth>
          <h1>Coordinator sign in</h1>
        </SignInForm>
      </Center>
    );
  }

  return children;
}

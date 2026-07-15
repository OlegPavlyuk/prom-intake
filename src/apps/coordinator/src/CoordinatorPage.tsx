import { AppShell, Button, Group, Title } from "@mantine/core";
import { useMedplum } from "@medplum/react";
import { AssignScreen } from "./assign/AssignScreen";

// The authenticated coordinator surface: a header with a sign-out control and the
// assign flow (#29). A single authenticated screen today, so no client-side
// routing yet; it arrives with the Worklist (#21), the second screen.
export function CoordinatorPage(): JSX.Element {
  const medplum = useMedplum();

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>PROM Intake - Coordinator</Title>
          <Button
            variant="subtle"
            onClick={() => {
              void medplum.signOut();
            }}
          >
            Sign out
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <AssignScreen />
      </AppShell.Main>
    </AppShell>
  );
}

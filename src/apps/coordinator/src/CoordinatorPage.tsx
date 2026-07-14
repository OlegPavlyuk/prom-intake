import { AppShell, Button, Group, Text, Title } from "@mantine/core";
import { useMedplum } from "@medplum/react";

// The authenticated coordinator surface. This foundation ticket (#28) ships an
// empty shell - a header with a sign-out control and a placeholder body. The
// assign flow and the Worklist land in later slices (#29, #21).
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
        <Text c="dimmed">
          You are signed in. Assigning Instruments and the Worklist arrive in
          the next slices.
        </Text>
      </AppShell.Main>
    </AppShell>
  );
}

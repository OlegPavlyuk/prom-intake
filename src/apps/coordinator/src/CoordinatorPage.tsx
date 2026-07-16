import { useState } from "react";
import { AppShell, Button, Group, Tabs, Title } from "@mantine/core";
import { useMedplum } from "@medplum/react";
import { AssignScreen } from "./assign/AssignScreen";
import { WorklistScreen } from "./worklist/WorklistScreen";

// The authenticated coordinator surface: a header with a sign-out control and the
// two coordinator screens - assign (#29) and the Worklist (#21) - behind tabs.
// The Worklist mounts only while its tab is active, so its data load fires when
// the coordinator opens it, not on every page render.
export function CoordinatorPage(): JSX.Element {
  const medplum = useMedplum();
  const [tab, setTab] = useState<string | null>("worklist");

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
        <Tabs value={tab} onChange={setTab} keepMounted={false}>
          <Tabs.List mb="lg">
            <Tabs.Tab value="worklist">Worklist</Tabs.Tab>
            <Tabs.Tab value="assign">Assign</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="worklist">
            {tab === "worklist" && <WorklistScreen />}
          </Tabs.Panel>
          <Tabs.Panel value="assign">
            {tab === "assign" && <AssignScreen />}
          </Tabs.Panel>
        </Tabs>
      </AppShell.Main>
    </AppShell>
  );
}

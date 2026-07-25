import { useState } from "react";
import { AppShell, Button, Group, Tabs, Title } from "@mantine/core";
import { useMedplum } from "@medplum/react";
import { AssignScreen } from "./assign/AssignScreen";
import { WorklistScreen } from "./worklist/WorklistScreen";
import {
  PatientTimelineScreen,
  type SelectedPatient,
} from "./timeline/PatientTimelineScreen";

// The authenticated coordinator surface: a header with a sign-out control and the
// coordinator screens - the Worklist (#21), assign (#29), and a patient's
// assessment history (#46) - behind tabs. Each screen mounts only while its tab
// is active, so its data load fires when the coordinator opens it, not on every
// page render. Opening a patient's history from a Flag on the Worklist switches to
// the history tab with that patient preselected (FR-33).
export function CoordinatorPage(): JSX.Element {
  const medplum = useMedplum();
  const [tab, setTab] = useState<string | null>("worklist");
  // The patient to preselect when the history tab opens, set when navigating in
  // from a Flag's detail. A direct click on the tab (no preselection) starts on
  // search instead.
  const [historyPatient, setHistoryPatient] = useState<SelectedPatient | null>(
    null
  );

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
            <Tabs.Tab value="history">Patient history</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="worklist">
            {tab === "worklist" && (
              <WorklistScreen
                onViewHistory={(patient) => {
                  setHistoryPatient(patient);
                  setTab("history");
                }}
              />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="assign">
            {tab === "assign" && <AssignScreen />}
          </Tabs.Panel>
          <Tabs.Panel value="history">
            {tab === "history" && (
              <PatientTimelineScreen
                initialPatient={historyPatient ?? undefined}
              />
            )}
          </Tabs.Panel>
        </Tabs>
      </AppShell.Main>
    </AppShell>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Radio,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { formatDateTime, formatHumanName } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { useMedplum } from "@medplum/react";
import type { FlagStatus } from "../../../../packages/domain/workflow.js";
import { loadPatientTimeline, type TimelineRow } from "./timelineData";

// The coordinator patient-history screen (FR-33): search for a patient, then see
// their completed Responses newest-first - each with its Instrument, submission
// time, total Score + severity band, and Flag status (none / Open / Acknowledged /
// Resolved). Read-only: it turns the FR-32 data (persisted regardless of flagging)
// into a coordinator-visible view, so a never-flagged assessment - invisible on
// the Worklist - is finally answerable here. The timeline load is injectable so
// the UI-seam tests drive the screen without the backend modules (they have their
// own integration test); production binds to the authenticated `useMedplum()`
// client (ADR-0010). The screen trusts the composition's reverse-chronological
// order and never re-sorts.

/** A patient the coordinator has chosen to view. */
export interface SelectedPatient {
  readonly id: string;
  readonly name: string;
}

export interface PatientTimelineScreenProps {
  /** Load a patient's timeline rows (defaults to the authenticated client). */
  readonly load?: (patientId: string) => Promise<TimelineRow[]>;
  /**
   * A patient to open immediately, skipping the search - used when the
   * coordinator navigates here from a patient's Flag on the Worklist (FR-33).
   * The search stays available to look up a different patient.
   */
  readonly initialPatient?: SelectedPatient;
}

const FLAG_BADGE: Record<FlagStatus, { readonly color: string }> = {
  Open: { color: "orange" },
  Acknowledged: { color: "blue" },
  Resolved: { color: "green" },
};

function patientLabel(patient: Patient): string {
  const name = patient.name?.[0];
  return name ? formatHumanName(name) : (patient.id ?? "Unnamed patient");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** The Score + severity band as one display string, e.g. "15 (Moderately severe)". */
function scoreLabel(row: TimelineRow): string {
  return row.band ? `${row.total} (${row.band.label})` : String(row.total);
}

export function PatientTimelineScreen({
  load,
  initialPatient,
}: PatientTimelineScreenProps): JSX.Element {
  const medplum = useMedplum();
  const doLoad = useCallback(
    (patientId: string) =>
      (load ?? ((id: string) => loadPatientTimeline(medplum, id)))(patientId),
    [load, medplum]
  );

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Patient[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Start on the patient the coordinator navigated in with (if any), so their
  // history loads without a search; the search below can still switch patients.
  const [selected, setSelected] = useState<SelectedPatient | null>(
    initialPatient ?? null
  );
  const [rows, setRows] = useState<TimelineRow[] | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Load the selected patient's timeline; a later selection supersedes an
  // in-flight load (the `live` guard) so a slow response never overwrites a newer.
  useEffect(() => {
    if (!selected) {
      return;
    }
    let live = true;
    setRows(null);
    setTimelineError(null);
    doLoad(selected.id)
      .then((loaded) => live && setRows(loaded))
      .catch((err) => live && setTimelineError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [doLoad, selected]);

  async function runSearch(): Promise<void> {
    setSearching(true);
    setSearchError(null);
    try {
      const found = await medplum.searchResources("Patient", {
        name: query,
        _count: "10",
      });
      setResults(found);
      setSearched(true);
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Stack maw={880} gap="lg">
      <div>
        <Title order={3}>Patient history</Title>
        <Text c="dimmed" size="sm">
          Search for a patient to see their completed assessments over time,
          most recent first - including results that raised no Flag.
        </Text>
      </div>

      {searchError && (
        <Alert color="red" title="Could not search for patients">
          {searchError}
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stack>
          <Title order={5}>Patient</Title>
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Find a patient"
              placeholder="Patient name"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim().length > 0) {
                  void runSearch();
                }
              }}
              style={{ flex: 1 }}
            />
            <Button
              variant="default"
              onClick={() => void runSearch()}
              loading={searching}
              disabled={query.trim().length === 0}
            >
              Search
            </Button>
          </Group>

          {results.length > 0 && (
            <Radio.Group
              label="Results"
              value={selected?.id ?? null}
              onChange={(id) => {
                const patient = results.find((p) => p.id === id);
                if (patient) {
                  setSelected({ id, name: patientLabel(patient) });
                }
              }}
            >
              <Stack gap="xs" mt="xs">
                {results.map((patient) => (
                  <Radio
                    key={patient.id}
                    value={patient.id ?? ""}
                    label={patientLabel(patient)}
                  />
                ))}
              </Stack>
            </Radio.Group>
          )}
          {searched && results.length === 0 && (
            <Text size="sm" c="dimmed">
              No patients matched.
            </Text>
          )}
        </Stack>
      </Card>

      {selected && (
        <Stack gap="sm">
          <Title order={4}>Assessment history for {selected.name}</Title>

          {timelineError && (
            <Alert color="red" title="Could not load the history">
              {timelineError}
            </Alert>
          )}

          {rows === null && !timelineError && (
            <Center py="xl">
              <Loader />
            </Center>
          )}

          {rows !== null && rows.length === 0 && (
            <Text c="dimmed">
              No completed assessments yet for this patient.
            </Text>
          )}

          {rows !== null && rows.length > 0 && (
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Instrument</Table.Th>
                  <Table.Th>Submitted</Table.Th>
                  <Table.Th>Score</Table.Th>
                  <Table.Th>Flag</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.responseId}>
                    <Table.Td>{row.instrumentTitle}</Table.Td>
                    <Table.Td>{formatDateTime(row.submittedAt)}</Table.Td>
                    <Table.Td>{scoreLabel(row)}</Table.Td>
                    <Table.Td>
                      {row.flagStatus ? (
                        <Badge
                          color={FLAG_BADGE[row.flagStatus].color}
                          variant="light"
                        >
                          {row.flagStatus}
                        </Badge>
                      ) : (
                        <Text c="dimmed" size="sm">
                          None
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      )}
    </Stack>
  );
}

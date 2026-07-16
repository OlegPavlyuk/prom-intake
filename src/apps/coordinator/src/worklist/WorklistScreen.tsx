import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { formatDateTime } from "@medplum/core";
import { useMedplum } from "@medplum/react";
import type { FlagPriority } from "../../../../packages/domain/instrument.js";
import {
  getFlagDetail,
  loadWorklist,
  type FlagDetail,
  type WorklistRow,
} from "./worklistData";
import { FlagDetailView } from "./FlagDetailView";

// The coordinator Worklist screen (FR-23/24/25): the shared, prioritized list of
// unresolved Flags, and - on selecting one - the FR-29 Flag detail. It trusts the
// service's order (PriorityPolicy; ADR-0007) and never re-sorts. Data loading is
// injectable so the UI-seam tests drive the screen without the backend modules
// (they have their own integration tests); production binds to the authenticated
// `useMedplum()` client (ADR-0010).

export interface WorklistScreenProps {
  /** Load the prioritized Worklist rows (defaults to the authenticated client). */
  readonly load?: () => Promise<WorklistRow[]>;
  /** Load one Flag's FR-29 detail (defaults to the authenticated client). */
  readonly loadDetail?: (flagId: string) => Promise<FlagDetail>;
}

const PRIORITY_LABEL: Record<FlagPriority, string> = {
  "acute-risk": "Acute risk",
  urgent: "Urgent",
  routine: "Routine",
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function WorklistScreen({
  load,
  loadDetail,
}: WorklistScreenProps): JSX.Element {
  const medplum = useMedplum();
  const doLoad = useCallback(
    () => (load ?? (() => loadWorklist(medplum)))(),
    [load, medplum]
  );
  const doLoadDetail = useCallback(
    (flagId: string) =>
      (loadDetail ?? ((id: string) => getFlagDetail(medplum, id)))(flagId),
    [loadDetail, medplum]
  );

  const [rows, setRows] = useState<WorklistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlagDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    doLoad()
      .then((loaded) => live && setRows(loaded))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [doLoad]);

  async function openFlag(flagId: string): Promise<void> {
    setOpeningId(flagId);
    setError(null);
    try {
      setDetail(await doLoadDetail(flagId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOpeningId(null);
    }
  }

  if (detail) {
    return <FlagDetailView detail={detail} onBack={() => setDetail(null)} />;
  }

  return (
    <Stack maw={880} gap="lg">
      <div>
        <Title order={3}>Worklist</Title>
        <Text c="dimmed" size="sm">
          Unresolved Flags across the organization, most urgent first. Open one
          to see its clinical signal.
        </Text>
      </div>

      {error && (
        <Alert color="red" title="Could not load the Worklist">
          {error}
        </Alert>
      )}

      {rows === null && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}

      {rows !== null && rows.length === 0 && (
        <Text c="dimmed">No unresolved Flags. The Worklist is clear.</Text>
      )}

      {rows !== null && rows.length > 0 && (
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Patient</Table.Th>
              <Table.Th>Priority</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Raised</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ flag, patientName }) => (
              <Table.Tr key={flag.id}>
                <Table.Td>{patientName}</Table.Td>
                <Table.Td>
                  <Badge
                    color={flag.priority === "acute-risk" ? "red" : "gray"}
                    variant={
                      flag.priority === "acute-risk" ? "filled" : "light"
                    }
                  >
                    {PRIORITY_LABEL[flag.priority]}
                  </Badge>
                </Table.Td>
                <Table.Td>{flag.status}</Table.Td>
                <Table.Td>{formatDateTime(flag.createdAt)}</Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="light"
                      loading={openingId === flag.id}
                      onClick={() => void openFlag(flag.id)}
                    >
                      View
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

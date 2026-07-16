import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { formatDateTime } from "@medplum/core";
import type { FlagPriority } from "../../../../packages/domain/instrument.js";
import type { FlagStatus } from "../../../../packages/domain/workflow.js";
import type { FlagDetail } from "./worklistData";

// The Flag detail view (FR-29): the full clinical signal for one Flag - patient
// identity, Instrument + submission time, total Score + severity band, which
// Trigger(s) fired (acute-risk highlighted), and the item-level answers (notably
// the acute-risk item). Purely presentational: it takes an already-composed
// `FlagDetail` (assembled by `getFlagDetail` through the module entry points) so
// it holds no data-loading or FHIR knowledge and is trivially unit-testable.

export interface FlagDetailViewProps {
  readonly detail: FlagDetail;
  /** Return to the Worklist. */
  readonly onBack: () => void;
}

const PRIORITY_LABEL: Record<FlagPriority, string> = {
  "acute-risk": "Acute risk",
  urgent: "Urgent",
  routine: "Routine",
};

const STATUS_LABEL: Record<FlagStatus, string> = {
  Open: "Open",
  Acknowledged: "Acknowledged",
  Resolved: "Resolved",
};

export function FlagDetailView({
  detail,
  onBack,
}: FlagDetailViewProps): JSX.Element {
  const { flag } = detail;
  return (
    <Stack maw={720} gap="lg">
      <Group justify="space-between" align="center">
        <Button variant="subtle" onClick={onBack}>
          Back to Worklist
        </Button>
        <Group gap="xs">
          <Badge
            color={flag.priority === "acute-risk" ? "red" : "gray"}
            variant={flag.priority === "acute-risk" ? "filled" : "light"}
          >
            {PRIORITY_LABEL[flag.priority]}
          </Badge>
          <Badge color="blue" variant="light">
            {STATUS_LABEL[flag.status]}
          </Badge>
        </Group>
      </Group>

      <div>
        <Title order={3}>{detail.patientName}</Title>
        <Text c="dimmed" size="sm">
          {detail.instrumentTitle} - submitted{" "}
          {formatDateTime(detail.submittedAt)}
        </Text>
      </div>

      <Card withBorder padding="lg">
        <Group justify="space-between" align="center">
          <div>
            <Text size="sm" c="dimmed">
              Total score
            </Text>
            <Text fw={700} size="xl">
              {detail.total}
            </Text>
          </div>
          {detail.band && (
            <Badge size="lg" variant="light">
              {detail.band.label}
            </Badge>
          )}
        </Group>
      </Card>

      <Card withBorder padding="lg">
        <Stack gap="sm">
          <Title order={5}>Why this was flagged</Title>
          {detail.triggers.map((trigger) => (
            <Group key={trigger.code} gap="xs">
              {trigger.acuteRisk && (
                <Badge color="red" variant="filled">
                  Acute risk
                </Badge>
              )}
              <Text>{trigger.label}</Text>
            </Group>
          ))}
        </Stack>
      </Card>

      <Card withBorder padding="lg">
        <Stack gap="sm">
          <Title order={5}>Answers</Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>Answer</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Score</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.answers.map((answer) => (
                <Table.Tr
                  key={answer.linkId}
                  bg={answer.acuteRisk ? "red.0" : undefined}
                >
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm">{answer.text}</Text>
                      {answer.acuteRisk && (
                        <Badge
                          color="red"
                          size="sm"
                          variant="light"
                          style={{ flexShrink: 0 }}
                        >
                          Acute-risk item
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{answer.answerLabel}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    {answer.weight}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>
    </Stack>
  );
}

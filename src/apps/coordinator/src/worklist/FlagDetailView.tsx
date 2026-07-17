import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { formatDateTime } from "@medplum/core";
import type { FlagPriority } from "../../../../packages/domain/instrument.js";
import type {
  FlagStatus,
  Resolution,
  ResolutionReason,
} from "../../../../packages/domain/workflow.js";
import type { FlagDetail } from "./worklistData";

// The Flag detail view (FR-29): the full clinical signal for one Flag - patient
// identity, Instrument + submission time, total Score + severity band, which
// Trigger(s) fired (acute-risk highlighted), and the item-level answers (notably
// the acute-risk item). Purely presentational: it takes an already-composed
// `FlagDetail` (assembled by `getFlagDetail` through the module entry points) so
// it holds no data-loading or FHIR knowledge and is trivially unit-testable.

/** A message surfaced alongside the claim action (a race loss, or an error). */
export interface ClaimNotice {
  readonly kind: "info" | "error";
  readonly message: string;
}

export interface FlagDetailViewProps {
  readonly detail: FlagDetail;
  /** Return to the Worklist. */
  readonly onBack: () => void;
  /**
   * Claim (Acknowledge) this Flag for the signed-in coordinator (FR-26). When
   * omitted, the claim control is hidden (e.g. a Flag that is not Open).
   */
  readonly onAcknowledge?: () => void;
  /** The claim is in flight (button shows a spinner, guarded against re-click). */
  readonly claiming?: boolean;
  /** A notice to show under the claim control (already-claimed, or an error). */
  readonly notice?: ClaimNotice | null;
  /**
   * Resolve this Flag with a structured reason (+ optional note) for the
   * signed-in coordinator (FR-27/28). When omitted, the resolve control is hidden
   * (e.g. an already-Resolved Flag). `other` requires a note (enforced here too).
   */
  readonly onResolve?: (resolution: Resolution) => void;
  /** The resolve is in flight (button shows a spinner, guarded against re-click). */
  readonly resolving?: boolean;
  /** A notice to show under the resolve control (an error). */
  readonly resolveNotice?: ClaimNotice | null;
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

/** The FR-28 Resolution-reason enum with display labels (mirrors the CodeSystem). */
const RESOLUTION_REASONS: ReadonlyArray<{
  value: ResolutionReason;
  label: string;
}> = [
  { value: "contacted-patient", label: "Contacted patient" },
  { value: "follow-up-scheduled", label: "Follow-up scheduled" },
  { value: "referred-to-clinician", label: "Referred to clinician" },
  { value: "escalated", label: "Escalated" },
  { value: "no-action-needed", label: "No action needed" },
  { value: "duplicate-invalid", label: "Duplicate / invalid response" },
  { value: "other", label: "Other (requires note)" },
];

const REASON_LABEL: Record<ResolutionReason, string> = Object.fromEntries(
  RESOLUTION_REASONS.map((r) => [r.value, r.label])
) as Record<ResolutionReason, string>;

export function FlagDetailView({
  detail,
  onBack,
  onAcknowledge,
  claiming,
  notice,
  onResolve,
  resolving,
  resolveNotice,
}: FlagDetailViewProps): JSX.Element {
  const { flag } = detail;
  const isOpen = flag.status === "Open";
  const isResolved = flag.status === "Resolved";
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
              Ownership
            </Text>
            <Text fw={600}>
              {isOpen
                ? "Unclaimed - Open on the Worklist"
                : `Claimed by ${detail.ownerName ?? "another coordinator"}`}
            </Text>
          </div>
          {isOpen && onAcknowledge && (
            <Button loading={claiming} onClick={onAcknowledge}>
              Claim
            </Button>
          )}
        </Group>
        {notice && (
          <Alert
            mt="md"
            color={notice.kind === "error" ? "red" : "yellow"}
            title={
              notice.kind === "error" ? "Could not claim this Flag" : undefined
            }
          >
            {notice.message}
          </Alert>
        )}
      </Card>

      {isResolved && flag.resolution && (
        <Card withBorder padding="lg">
          <Stack gap="xs">
            <Title order={5}>Resolution</Title>
            <Text fw={600}>{REASON_LABEL[flag.resolution.reason]}</Text>
            {flag.resolution.note && (
              <Text c="dimmed">{flag.resolution.note}</Text>
            )}
            {flag.resolvedAt && (
              <Text size="sm" c="dimmed">
                Resolved {formatDateTime(flag.resolvedAt)}
              </Text>
            )}
          </Stack>
        </Card>
      )}

      {!isResolved && onResolve && (
        <ResolveFlagCard
          onResolve={onResolve}
          resolving={resolving}
          notice={resolveNotice}
        />
      )}

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

interface ResolveFlagCardProps {
  readonly onResolve: (resolution: Resolution) => void;
  readonly resolving?: boolean;
  readonly notice?: ClaimNotice | null;
}

/**
 * The Resolve control (FR-27/28): pick a Resolution reason from the predefined
 * enum, with an optional free-text note - required when the reason is "Other".
 * Holds only its own form state; the actual resolve is delegated up via
 * `onResolve` so this stays presentational (no data loading, no FHIR).
 */
function ResolveFlagCard({
  onResolve,
  resolving,
  notice,
}: ResolveFlagCardProps): JSX.Element {
  const [reason, setReason] = useState<ResolutionReason | null>(null);
  const [note, setNote] = useState("");
  const noteRequired = reason === "other";
  const canResolve =
    reason !== null && (!noteRequired || note.trim().length > 0);

  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={5}>Resolve this Flag</Title>
        <Text size="sm" c="dimmed">
          Record why this Flag is leaving the Worklist. Resolving keeps its
          history.
        </Text>
        <Select
          label="Resolution reason"
          placeholder="Select a reason"
          data={RESOLUTION_REASONS as { value: string; label: string }[]}
          value={reason}
          onChange={(value) => setReason(value as ResolutionReason | null)}
          required
          allowDeselect={false}
        />
        <Textarea
          label="Note"
          description={
            noteRequired
              ? "Required when the reason is Other."
              : "Optional context for this resolution."
          }
          placeholder="Add context for this resolution"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          required={noteRequired}
          autosize
          minRows={2}
        />
        {notice && (
          <Alert
            color={notice.kind === "error" ? "red" : "yellow"}
            title={
              notice.kind === "error"
                ? "Could not resolve this Flag"
                : undefined
            }
          >
            {notice.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button
            loading={resolving}
            disabled={!canResolve}
            onClick={() =>
              reason &&
              onResolve({
                reason,
                ...(note.trim() ? { note: note.trim() } : {}),
              })
            }
          >
            Resolve Flag
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

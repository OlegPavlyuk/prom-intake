import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Radio,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { formatDate, formatHumanName } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { useMedplum } from "@medplum/react";
import { assignInstrument, type AssignmentResult } from "./assignInstrument";

// Base URL of the Patient completion page (#16, a separate Vite bundle) used to
// assemble the Access-link URL. A non-secret Vite build/runtime var; defaults to
// local dev (infrastructure.md).
const PATIENT_APP_BASE_URL =
  import.meta.env.VITE_PATIENT_APP_BASE_URL ?? "http://localhost:3001/";

/** A patient the coordinator has chosen to assign to. */
interface SelectedPatient {
  readonly id: string;
  readonly name: string;
}

export interface AssignScreenProps {
  /**
   * The assign orchestration (load Instrument -> create Assignment -> issue link
   * -> assemble URL). Injectable so the UI-seam tests drive the screen without
   * re-exercising the backend modules against MockClient (they have their own
   * integration tests); production binds it to the authenticated client.
   */
  readonly assign?: (patientId: string) => Promise<AssignmentResult>;
}

function patientLabel(patient: Patient): string {
  const name = patient.name?.[0];
  return name ? formatHumanName(name) : (patient.id ?? "Unnamed patient");
}

// The assign flow (FR-5, FR-6, FR-10, FR-12): pick or create a patient, assign
// PHQ-9, and show the single-use Access link to deliver out-of-band. Reissue is
// simply assigning again - each assign is a fresh Assignment + link, no separate
// resend path (FR-10). The raw link is held only in memory and shown once.
export function AssignScreen({ assign }: AssignScreenProps): JSX.Element {
  const medplum = useMedplum();
  const doAssign =
    assign ??
    ((patientId: string) =>
      assignInstrument(medplum, {
        patientId,
        patientAppBaseUrl: PATIENT_APP_BASE_URL,
      }));

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Patient[]>([]);

  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<SelectedPatient | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Choosing a different patient invalidates any link already on screen - a link
  // belongs to one patient, so never leave a stale one showing.
  function choosePatient(patient: SelectedPatient): void {
    setSelected(patient);
    setResult(null);
    setError(null);
  }

  async function runSearch(): Promise<void> {
    setSearching(true);
    setError(null);
    try {
      const found = await medplum.searchResources("Patient", {
        name: query,
        _count: "10",
      });
      setResults(found);
      setSearched(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function createPatient(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: [given.trim()], family: family.trim() }],
      });
      choosePatient({ id: patient.id!, name: patientLabel(patient) });
      setGiven("");
      setFamily("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function runAssign(): Promise<void> {
    if (!selected) {
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      setResult(await doAssign(selected.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAssigning(false);
    }
  }

  const canCreate = given.trim().length > 0 && family.trim().length > 0;

  return (
    <Stack maw={640} gap="lg">
      <div>
        <Title order={3}>Assign PHQ-9</Title>
        <Text c="dimmed" size="sm">
          Select a patient (or create one), assign the PHQ-9 Instrument, and
          deliver the generated single-use Access link.
        </Text>
      </div>

      {error && (
        <Alert color="red" title="Could not complete the request">
          {error}
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stack>
          <Title order={5}>Patient</Title>

          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Find an existing patient"
              placeholder="Patient name"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
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
                  choosePatient({ id, name: patientLabel(patient) });
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

          <Divider label="or create a new patient" labelPosition="center" />

          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Given name"
              value={given}
              onChange={(e) => setGiven(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <TextInput
              label="Family name"
              value={family}
              onChange={(e) => setFamily(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              variant="default"
              onClick={() => void createPatient()}
              loading={creating}
              disabled={!canCreate}
            >
              Create patient
            </Button>
          </Group>
        </Stack>
      </Card>

      {selected && (
        <Text>
          Selected patient: <b>{selected.name}</b>
        </Text>
      )}

      <Group>
        <Button
          onClick={() => void runAssign()}
          disabled={!selected}
          loading={assigning}
        >
          Assign PHQ-9
        </Button>
      </Group>

      {result && (
        <Card withBorder padding="lg">
          <Stack>
            <Title order={5}>{result.instrumentTitle} assigned</Title>
            <Text size="sm">
              Deliver this single-use Access link to the patient. It is shown
              here once and expires on {formatDate(result.expiresAt)}.
            </Text>
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                readOnly
                aria-label="Access link"
                value={result.accessLinkUrl}
                style={{ flex: 1 }}
              />
              <CopyButton value={result.accessLinkUrl}>
                {({ copied, copy }) => (
                  <Button variant="default" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Group>
              <Button
                variant="subtle"
                onClick={() => void runAssign()}
                loading={assigning}
              >
                Reissue link
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

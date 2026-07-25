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

// A new-patient name exactly matches an existing Patient when its given and family
// parts are equal, ignoring case and surrounding whitespace. Used for the pre-create
// collision check (FR-35) - the cheap half of duplicate avoidance; full identity
// matching (MRN/DOB, fuzzy) stays deferred (Spec #45).
function nameMatches(patient: Patient, given: string, family: string): boolean {
  const name = patient.name?.[0];
  if (!name) {
    return false;
  }
  const norm = (value: string): string => value.trim().toLowerCase();
  const patientGiven = norm((name.given ?? []).join(" "));
  const patientFamily = norm(name.family ?? "");
  return patientGiven === norm(given) && patientFamily === norm(family);
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

  // Create is search-first-gated (FR-35): the form is revealed by a deliberate
  // action (or after a no-match search), never presented as an equal option.
  const [showCreate, setShowCreate] = useState(false);
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [creating, setCreating] = useState(false);
  // Existing Patients whose name collides with the one being created; while
  // non-empty the coordinator is warned and offered the existing record instead.
  const [collisions, setCollisions] = useState<Patient[]>([]);

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
      // No existing patient matched: surface Create as the explicit fallback.
      if (found.length === 0) {
        setShowCreate(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  function resetCreateForm(): void {
    setGiven("");
    setFamily("");
    setCollisions([]);
    setShowCreate(false);
  }

  function useExistingPatient(patient: Patient): void {
    choosePatient({ id: patient.id!, name: patientLabel(patient) });
    resetCreateForm();
  }

  async function doCreate(): Promise<void> {
    const patient = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: [given.trim()], family: family.trim() }],
    });
    choosePatient({ id: patient.id!, name: patientLabel(patient) });
    resetCreateForm();
  }

  // Create a patient, but first reuse the Patient search to catch an exact name
  // collision and warn instead of minting a duplicate (FR-35). The coordinator can
  // then pick the existing record or, with `force`, deliberately create a same-named
  // patient anyway (real people share names). The check searches on the full name -
  // the same `name` param the primary search uses, whose whitespace tokens are ANDed
  // across name parts - so results are already narrowed to that name before the exact
  // filter; full identity matching (MRN/DOB, fuzzy) stays deferred (Spec #45).
  async function createPatient({ force = false } = {}): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      if (!force) {
        const found = await medplum.searchResources("Patient", {
          name: `${given.trim()} ${family.trim()}`,
          _count: "20",
        });
        const matches = found.filter((p) => nameMatches(p, given, family));
        if (matches.length > 0) {
          setCollisions(matches);
          return;
        }
      }
      await doCreate();
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
          Search for the patient, assign the PHQ-9 Instrument, and deliver the
          generated single-use Access link. Create a new patient only if the
          search finds no match.
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
              No patients matched. Create a new patient below.
            </Text>
          )}

          {!showCreate && (
            <Group>
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => setShowCreate(true)}
              >
                Create a new patient
              </Button>
            </Group>
          )}

          {showCreate && (
            <Stack gap="sm">
              <Divider label="New patient" labelPosition="center" />

              {collisions.length > 0 && (
                <Alert
                  color="yellow"
                  title="A patient with this name already exists"
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      Use the existing record instead of creating a duplicate:
                    </Text>
                    {collisions.map((patient) => (
                      <Button
                        key={patient.id}
                        variant="default"
                        size="xs"
                        onClick={() => useExistingPatient(patient)}
                      >
                        Use {patientLabel(patient)}
                      </Button>
                    ))}
                    <Button
                      variant="subtle"
                      color="red"
                      size="compact-xs"
                      onClick={() => void createPatient({ force: true })}
                      loading={creating}
                    >
                      Create new patient anyway
                    </Button>
                  </Stack>
                </Alert>
              )}

              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Given name"
                  value={given}
                  onChange={(e) => {
                    setGiven(e.currentTarget.value);
                    setCollisions([]);
                  }}
                  style={{ flex: 1 }}
                />
                <TextInput
                  label="Family name"
                  value={family}
                  onChange={(e) => {
                    setFamily(e.currentTarget.value);
                    setCollisions([]);
                  }}
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
          )}
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

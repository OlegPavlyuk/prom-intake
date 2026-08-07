/**
 * The synthetic patients every seeded project starts with (ADR-0012, T18).
 *
 * The public demo is self-serve: a visitor lands on the Worklist with published
 * credentials and must be able to assign an Instrument immediately, without
 * inventing a patient first. These are obviously-fake records - the names say so
 * out loud - so nothing here can be mistaken for a real person, which is the same
 * promise the demo banner makes in the UI.
 *
 * The roster is also the **reset baseline**: `reset-hosted.ts` asserts the freshly
 * rebuilt project holds exactly these Patients and no other demo activity, so a
 * missed expunge fails the deploy instead of shipping a drifted demo.
 */
import type { MedplumClient } from "@medplum/core";
import type { HumanName, Patient } from "@medplum/fhirtypes";

/** One synthetic patient, in the same shape the coordinator's create flow uses. */
export interface SyntheticPatient {
  readonly given: string;
  readonly family: string;
}

/**
 * Deliberately unmistakable names. Three is enough to make the patient search
 * meaningful (it returns a list, not a single row) while keeping the baseline
 * small enough to assert exactly.
 */
export const SYNTHETIC_PATIENTS: readonly SyntheticPatient[] = [
  { given: "Demo", family: "Patientone" },
  { given: "Demo", family: "Patienttwo" },
  { given: "Demo", family: "Patientthree" },
];

/** How a synthetic patient reads in the UI, e.g. "Demo Patientone". */
function syntheticPatientLabel(patient: SyntheticPatient): string {
  return `${patient.given} ${patient.family}`;
}

/**
 * Create any synthetic patient the project is missing. Idempotent: keyed on the
 * exact name, so re-seeding a surviving project neither duplicates nor mutates
 * (the same upsert-by-identity contract as the Instrument seeder).
 */
export async function seedSyntheticPatients(
  medplum: MedplumClient
): Promise<void> {
  for (const synthetic of SYNTHETIC_PATIENTS) {
    if (await findByName(medplum, synthetic)) {
      continue;
    }
    await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: [synthetic.given], family: synthetic.family }],
    });
  }
}

/**
 * Find a synthetic patient by exact name. Medplum's `name` search is a
 * contains-match across name parts, so narrow with the search and then confirm
 * the exact given/family pair - the same two-step the coordinator's duplicate
 * check uses (FR-35).
 */
async function findByName(
  medplum: MedplumClient,
  synthetic: SyntheticPatient
): Promise<Patient | undefined> {
  const candidates = await medplum.searchResources("Patient", {
    name: syntheticPatientLabel(synthetic),
    _count: "20",
  });
  return candidates.find((patient) => matches(patient.name?.[0], synthetic));
}

function matches(
  name: HumanName | undefined,
  synthetic: SyntheticPatient
): boolean {
  // Case- and whitespace-insensitive, matching how the coordinator's own
  // duplicate check compares names (FR-35): "already seeded" and "already
  // exists, warn me" must not disagree about what the same name is, or a re-seed
  // would mint a near-duplicate the baseline assertion then rejects.
  const norm = (value: string): string => value.trim().toLowerCase();
  return (
    norm((name?.given ?? []).join(" ")) === norm(synthetic.given) &&
    norm(name?.family ?? "") === norm(synthetic.family)
  );
}

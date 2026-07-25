import { MantineProvider } from "@mantine/core";
import { MockClient } from "@medplum/mock";
import { MedplumProvider } from "@medplum/react";
import type { Patient } from "@medplum/fhirtypes";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PatientTimelineScreen } from "./PatientTimelineScreen";
import type { TimelineRow } from "./timelineData";

// The patient-timeline UI seam (the `ui` vitest project): drive patient select
// through a real MockClient (which models search faithfully) and inject the
// timeline load so the test asserts screen behaviour - it renders a patient's
// assessment history in the composition's order, shows every Flag status
// including "None" for a never-flagged Response, and never re-sorts - not the
// backend modules (they have their own integration test).

function renderScreen(
  load: (patientId: string) => Promise<TimelineRow[]>,
  medplum = new MockClient()
): { medplum: MockClient } {
  render(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <PatientTimelineScreen load={load} />
      </MantineProvider>
    </MedplumProvider>
  );
  return { medplum };
}

function row(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    responseId: "r1",
    instrumentTitle: "Patient Health Questionnaire-9 (PHQ-9)",
    submittedAt: "2026-07-15T09:00:00.000Z",
    total: 12,
    band: { code: "moderate", label: "Moderate" },
    ...overrides,
  };
}

async function selectPatient(name: string): Promise<void> {
  await userEvent.type(screen.getByLabelText(/find a patient/i), name);
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
  await userEvent.click(
    await screen.findByRole("radio", { name: new RegExp(name, "i") })
  );
}

async function withPatient(name: string): Promise<MockClient> {
  const medplum = new MockClient();
  await medplum.createResource<Patient>({
    resourceType: "Patient",
    name: [
      {
        given: [name.split(" ")[0]!],
        family: name.split(" ").slice(1).join(" "),
      },
    ],
  });
  return medplum;
}

describe("PatientTimelineScreen", () => {
  it("shows a patient's completed Responses newest-first with Score, band, and Flag status - including a never-flagged row (FR-33)", async () => {
    // Newest-first, as the composition returns them; the screen must not re-sort.
    const rows: TimelineRow[] = [
      row({
        responseId: "newest",
        submittedAt: "2026-07-14T09:00:00.000Z",
        total: 13,
        band: { code: "moderate", label: "Moderate" },
        flagStatus: "Resolved",
      }),
      row({
        responseId: "mid",
        submittedAt: "2026-07-12T09:00:00.000Z",
        total: 15,
        band: { code: "moderately-severe", label: "Moderately severe" },
        flagStatus: "Open",
      }),
      row({
        responseId: "oldest",
        submittedAt: "2026-07-10T09:00:00.000Z",
        total: 2,
        band: { code: "none-minimal", label: "None-minimal" },
        // No flagStatus: the FR-32 low-score / no-Trigger case, now visible.
      }),
    ];
    const load = vi.fn<(id: string) => Promise<TimelineRow[]>>(() =>
      Promise.resolve(rows)
    );
    const medplum = await withPatient("Ada Lovelace");
    renderScreen(load, medplum);

    await selectPatient("Ada Lovelace");

    expect(
      await screen.findByRole("heading", {
        name: /assessment history for ada lovelace/i,
      })
    ).toBeInTheDocument();
    const [patient] = await medplum.searchResources("Patient", {
      name: "Ada Lovelace",
    });
    expect(load).toHaveBeenCalledWith(patient!.id);

    // Rows render in the composition's order (no re-sorting): the score cells
    // follow the newest-first sequence the loader returned.
    const bodyRows = screen.getAllByRole("row").slice(1);
    const scores = bodyRows.map(
      (r) => within(r).getAllByRole("cell")[2]!.textContent
    );
    expect(scores).toEqual([
      "13 (Moderate)",
      "15 (Moderately severe)",
      "2 (None-minimal)",
    ]);

    // Every Flag status is shown, including "None" for the never-flagged Response.
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows an empty-history message for a patient with no completed assessments", async () => {
    const medplum = await withPatient("Grace Hopper");
    renderScreen(() => Promise.resolve([]), medplum);

    await selectPatient("Grace Hopper");

    expect(
      await screen.findByText(/no completed assessments yet/i)
    ).toBeInTheDocument();
  });

  it("tells the coordinator when no patient matches the search", async () => {
    renderScreen(() => Promise.resolve([])); // empty MockClient: nothing matches.

    await userEvent.type(screen.getByLabelText(/find a patient/i), "Nobody");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no patients matched/i)).toBeInTheDocument();
  });

  it("shows a friendly error when the timeline fails to load", async () => {
    const medplum = await withPatient("Alan Turing");
    renderScreen(() => Promise.reject(new Error("network down")), medplum);

    await selectPatient("Alan Turing");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/network down/i)).toBeInTheDocument();
  });
});

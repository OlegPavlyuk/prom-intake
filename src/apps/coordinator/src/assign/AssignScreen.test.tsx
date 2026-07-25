import { MantineProvider } from "@mantine/core";
import { MockClient } from "@medplum/mock";
import { MedplumProvider } from "@medplum/react";
import type { Patient } from "@medplum/fhirtypes";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssignScreen } from "./AssignScreen";
import type { AssignmentResult } from "./assignInstrument";
import { buildAccessLinkUrl } from "./accessLinkUrl";

// The assign flow's UI seam (the `ui` vitest project): drive the screen through a
// real MockClient for the patient select/create path - which MockClient models
// faithfully - and inject the assign orchestration (loadInstrument -> Assignment
// -> Access link) so the UI test asserts screen behaviour, not the backend modules
// (they have their own integration tests; MockClient cannot run loadInstrument).

function renderScreen(
  assign: (patientId: string) => Promise<AssignmentResult>,
  medplum = new MockClient()
): { medplum: MockClient } {
  render(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <AssignScreen assign={assign} />
      </MantineProvider>
    </MedplumProvider>
  );
  return { medplum };
}

function result(overrides: Partial<AssignmentResult> = {}): AssignmentResult {
  return {
    accessLinkUrl: buildAccessLinkUrl("http://localhost:3001/", "tok-1"),
    expiresAt: "2026-07-29T00:00:00.000Z",
    instrumentTitle: "Patient Health Questionnaire-9 (PHQ-9)",
    ...overrides,
  };
}

// Create is search-first-gated (FR-35): reveal the Create form via the deliberate
// action, then fill and submit it. Shared by the create-path tests so they stay
// focused on the assign/reissue/error behaviour rather than the reveal UX.
async function createNewPatient(given: string, family: string): Promise<void> {
  await userEvent.click(
    screen.getByRole("button", { name: /create a new patient/i })
  );
  await userEvent.type(screen.getByLabelText(/given name/i), given);
  await userEvent.type(screen.getByLabelText(/family name/i), family);
  await userEvent.click(
    screen.getByRole("button", { name: /^create patient$/i })
  );
}

describe("AssignScreen", () => {
  it("keeps Assign disabled until a patient is chosen", async () => {
    renderScreen(vi.fn());

    expect(
      screen.getByRole("button", { name: /assign phq-9/i })
    ).toBeDisabled();
  });

  it("presents search as the primary path and gates Create behind it", () => {
    renderScreen(vi.fn());

    // Search is the first, always-visible affordance.
    expect(
      screen.getByLabelText(/find an existing patient/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^search$/i })
    ).toBeInTheDocument();

    // Create is not an equal, always-available option: its form is gated.
    expect(screen.queryByLabelText(/given name/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^create patient$/i })
    ).not.toBeInTheDocument();
  });

  it("reveals the Create form only after a deliberate action", async () => {
    renderScreen(vi.fn());

    await userEvent.click(
      screen.getByRole("button", { name: /create a new patient/i })
    );

    expect(screen.getByLabelText(/given name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/family name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^create patient$/i })
    ).toBeInTheDocument();
  });

  it("offers Create after a search returns no match", async () => {
    renderScreen(vi.fn()); // empty MockClient - nothing matches.

    await userEvent.type(
      screen.getByLabelText(/find an existing patient/i),
      "Nobody"
    );
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no patients matched/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/given name/i)).toBeInTheDocument();
  });

  it("warns on an exact name collision and lets the coordinator use the existing patient", async () => {
    const medplum = new MockClient();
    const existing = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Ada"], family: "Lovelace" }],
    });
    const assign = vi.fn().mockResolvedValue(result());
    renderScreen(assign, medplum);
    const createSpy = vi.spyOn(medplum, "createResource");

    await createNewPatient("Ada", "Lovelace");

    // Warned - and no duplicate minted.
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    // Pick the existing record instead of creating a duplicate.
    await userEvent.click(
      screen.getByRole("button", { name: /use ada lovelace/i })
    );
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /^assign phq-9$/i })
    );
    expect(assign).toHaveBeenCalledWith(existing.id);
  });

  it("still allows creating a genuinely same-named patient after the warning", async () => {
    const medplum = new MockClient();
    await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Ada"], family: "Lovelace" }],
    });
    renderScreen(vi.fn(), medplum);
    const createSpy = vi.spyOn(medplum, "createResource");

    await createNewPatient("Ada", "Lovelace");
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /create new patient anyway/i })
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: "Patient" })
    );
  });

  it("creates a minimal patient, then assigns and shows the Access link once", async () => {
    const assign = vi.fn().mockResolvedValue(result());
    const { medplum } = renderScreen(assign);
    const createSpy = vi.spyOn(medplum, "createResource");

    await createNewPatient("Ada", "Lovelace");

    // The created patient becomes the selection, enabling assign.
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: "Patient" })
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^assign phq-9$/i })
    );

    const createdPatientId = (await createSpy.mock.results[0]!
      .value) as Patient;
    expect(assign).toHaveBeenCalledWith(createdPatientId.id);
    expect(await screen.findByLabelText(/access link/i)).toHaveValue(
      "http://localhost:3001/?token=tok-1"
    );
  });

  it("selects an existing patient from search results and assigns", async () => {
    const medplum = new MockClient();
    const existing = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Grace"], family: "Hopper" }],
    });
    const assign = vi.fn().mockResolvedValue(result());
    renderScreen(assign, medplum);

    await userEvent.type(
      screen.getByLabelText(/find an existing patient/i),
      "Hopper"
    );
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    const option = await screen.findByRole("radio", { name: /grace hopper/i });
    await userEvent.click(option);
    await userEvent.click(
      screen.getByRole("button", { name: /^assign phq-9$/i })
    );

    expect(assign).toHaveBeenCalledWith(existing.id);
    expect(await screen.findByLabelText(/access link/i)).toBeInTheDocument();
  });

  it("reissues a new link (new Assignment) when assigned again", async () => {
    const assign = vi
      .fn()
      .mockResolvedValueOnce(
        result({ accessLinkUrl: "http://localhost:3001/?token=first" })
      )
      .mockResolvedValueOnce(
        result({ accessLinkUrl: "http://localhost:3001/?token=second" })
      );
    renderScreen(assign);

    await createNewPatient("Ada", "Lovelace");
    await userEvent.click(
      screen.getByRole("button", { name: /^assign phq-9$/i })
    );
    expect(await screen.findByLabelText(/access link/i)).toHaveValue(
      "http://localhost:3001/?token=first"
    );

    await userEvent.click(
      screen.getByRole("button", { name: /reissue link/i })
    );

    expect(await screen.findByLabelText(/access link/i)).toHaveValue(
      "http://localhost:3001/?token=second"
    );
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it("shows a friendly error when assigning fails", async () => {
    const assign = vi
      .fn()
      .mockRejectedValue(new Error('Instrument "phq-9" not found'));
    renderScreen(assign);

    await createNewPatient("Ada", "Lovelace");
    await userEvent.click(
      screen.getByRole("button", { name: /^assign phq-9$/i })
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/phq-9.*not found/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/access link/i)).not.toBeInTheDocument();
  });
});

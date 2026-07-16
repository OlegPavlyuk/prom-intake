import { MantineProvider } from "@mantine/core";
import { MockClient } from "@medplum/mock";
import { MedplumProvider } from "@medplum/react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Flag } from "../../../../packages/domain/workflow.js";
import { WorklistScreen } from "./WorklistScreen";
import type { ClaimResult, FlagDetail, WorklistRow } from "./worklistData";

// The Worklist UI seam (the `ui` vitest project): drive the screen through
// injected loaders so the test asserts screen behaviour - it renders the rows in
// the service's order and opens a Flag's detail - not the backend modules (they
// have their own integration tests). Ordering is the service's job (PriorityPolicy);
// the screen must not re-sort.

function flag(overrides: Partial<Flag> = {}): Flag {
  return {
    id: "flag-1",
    patientId: "patient-1",
    status: "Open",
    priority: "routine",
    triggerCodes: ["t"],
    createdAt: "2026-07-15T09:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<FlagDetail> = {}): FlagDetail {
  return {
    flag: flag({ id: "flag-acute", priority: "acute-risk" }),
    patientName: "Ada Lovelace",
    instrumentTitle: "Patient Health Questionnaire-9 (PHQ-9)",
    submittedAt: "2026-07-15T09:00:00.000Z",
    total: 13,
    band: { code: "moderate", label: "Moderate" },
    triggers: [
      {
        code: "phq9-item-9-acute-risk",
        label: "PHQ-9 Item 9 positive (self-harm / acute risk)",
        acuteRisk: true,
      },
    ],
    answers: [
      {
        linkId: "phq9-item-9",
        text: "Thoughts of self-harm",
        answerLabel: "Several days",
        weight: 1,
        acuteRisk: true,
      },
    ],
    ...overrides,
  };
}

function renderScreen(props: {
  load?: () => Promise<WorklistRow[]>;
  loadDetail?: (flagId: string) => Promise<FlagDetail>;
  acknowledge?: (flagId: string) => Promise<ClaimResult>;
}): void {
  render(
    <MedplumProvider medplum={new MockClient()}>
      <MantineProvider>
        <WorklistScreen {...props} />
      </MantineProvider>
    </MedplumProvider>
  );
}

/** One acute-risk Flag row whose detail opens on View. */
const ACUTE_ROW: WorklistRow = {
  flag: flag({ id: "flag-acute", priority: "acute-risk" }),
  patientName: "Ada Lovelace",
};

describe("WorklistScreen", () => {
  it("renders Flags in the order the service returned them (no re-sorting)", async () => {
    const rows: WorklistRow[] = [
      {
        flag: flag({ id: "a", priority: "acute-risk" }),
        patientName: "Acute Ann",
      },
      {
        flag: flag({ id: "u", priority: "urgent" }),
        patientName: "Urgent Uma",
      },
      {
        flag: flag({ id: "r", priority: "routine" }),
        patientName: "Routine Rae",
      },
    ];
    renderScreen({ load: () => Promise.resolve(rows) });

    const names = (await screen.findAllByText(/Ann|Uma|Rae/)).map(
      (el) => el.textContent
    );
    expect(names).toEqual(["Acute Ann", "Urgent Uma", "Routine Rae"]);
    // Acute-risk is highlighted (filled red badge reads "Acute risk").
    expect(screen.getByText("Acute risk")).toBeInTheDocument();
  });

  it("shows a clear-Worklist message when there are no Flags", async () => {
    renderScreen({ load: () => Promise.resolve([]) });

    expect(await screen.findByText(/no unresolved flags/i)).toBeInTheDocument();
  });

  it("opens a Flag's detail on View and returns to the list on Back", async () => {
    const rows: WorklistRow[] = [
      {
        flag: flag({ id: "flag-acute", priority: "acute-risk" }),
        patientName: "Ada Lovelace",
      },
    ];
    const loadDetail = vi.fn().mockResolvedValue(detail());
    renderScreen({ load: () => Promise.resolve(rows), loadDetail });

    await userEvent.click(await screen.findByRole("button", { name: /view/i }));

    expect(loadDetail).toHaveBeenCalledWith("flag-acute");
    expect(
      await screen.findByRole("heading", { name: /ada lovelace/i })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /back to worklist/i })
    );
    expect(
      await screen.findByRole("heading", { name: /^worklist$/i })
    ).toBeInTheDocument();
  });

  it("shows a friendly error when the Worklist fails to load", async () => {
    renderScreen({ load: () => Promise.reject(new Error("network down")) });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/network down/i)).toBeInTheDocument();
  });

  it("claims a Flag from its detail and shows the coordinator who now owns it (FR-26)", async () => {
    const acknowledge = vi.fn().mockResolvedValue({
      outcome: "acknowledged",
      ownerName: "Ada Coordinator",
    });
    renderScreen({
      load: () => Promise.resolve([ACUTE_ROW]),
      loadDetail: () => Promise.resolve(detail()),
      acknowledge,
    });

    await userEvent.click(await screen.findByRole("button", { name: /view/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: /^claim$/i })
    );

    expect(acknowledge).toHaveBeenCalledWith("flag-acute");
    expect(
      await screen.findByText(/claimed by ada coordinator/i)
    ).toBeInTheDocument();
    // The claim control gives way to the owner once claimed.
    expect(
      screen.queryByRole("button", { name: /^claim$/i })
    ).not.toBeInTheDocument();
  });

  it("tells the coordinator when another already claimed the Flag (FlagAlreadyClaimed)", async () => {
    const acknowledge = vi.fn().mockResolvedValue({
      outcome: "already-claimed",
      ownerName: "Grace Hopper",
    });
    renderScreen({
      load: () => Promise.resolve([ACUTE_ROW]),
      loadDetail: () => Promise.resolve(detail()),
      acknowledge,
    });

    await userEvent.click(await screen.findByRole("button", { name: /view/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: /^claim$/i })
    );

    expect(
      await screen.findByText(/already claimed by grace hopper/i)
    ).toBeInTheDocument();
  });
});

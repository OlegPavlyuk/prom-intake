import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Flag } from "../../../../packages/domain/workflow.js";
import { FlagDetailView, type FlagDetailViewProps } from "./FlagDetailView";
import type { FlagDetail } from "./worklistData";

// The Flag detail's UI seam (the `ui` vitest project): render an already-composed
// `FlagDetail` and assert the FR-29 signal is shown - identity, Instrument +
// submission time, score + band, the fired Trigger (acute-risk highlighted), and
// the item-level answers (notably the acute-risk item). Purely presentational, so
// no client or data loading is involved.

const ACUTE_FLAG: Flag = {
  id: "flag-acute",
  patientId: "patient-1",
  status: "Open",
  priority: "acute-risk",
  triggerCodes: ["phq9-item-9-acute-risk"],
  createdAt: "2026-07-15T09:00:00.000Z",
};

function detail(overrides: Partial<FlagDetail> = {}): FlagDetail {
  return {
    flag: ACUTE_FLAG,
    patientName: "Ada Lovelace",
    instrumentTitle: "Patient Health Questionnaire-9 (PHQ-9)",
    submittedAt: "2026-07-15T09:30:00.000Z",
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
        linkId: "phq9-item-1",
        text: "Little interest or pleasure",
        answerLabel: "Nearly every day",
        weight: 3,
        acuteRisk: false,
      },
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

function renderView(
  d: FlagDetail,
  props: Partial<FlagDetailViewProps> = {}
): void {
  render(
    <MantineProvider>
      <FlagDetailView detail={d} onBack={vi.fn()} {...props} />
    </MantineProvider>
  );
}

describe("FlagDetailView", () => {
  it("shows patient identity, Instrument, score and severity band (FR-29)", () => {
    renderView(detail());

    expect(
      screen.getByRole("heading", { name: /ada lovelace/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Patient Health Questionnaire-9/)
    ).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
  });

  it("highlights the acute-risk Trigger among the reasons the Flag was raised", () => {
    renderView(detail());

    expect(screen.getByText(/item 9 positive/i)).toBeInTheDocument();
    // The acute-risk Trigger carries the highlighted "Acute risk" badge.
    expect(screen.getAllByText(/acute risk/i).length).toBeGreaterThan(0);
  });

  it("lists item-level answers and marks the acute-risk item (Item 9)", () => {
    renderView(detail());

    const item9Row = screen.getByText("Thoughts of self-harm").closest("tr")!;
    expect(within(item9Row).getByText("Several days")).toBeInTheDocument();
    expect(within(item9Row).getByText(/acute-risk item/i)).toBeInTheDocument();

    const item1Row = screen
      .getByText("Little interest or pleasure")
      .closest("tr")!;
    expect(within(item1Row).getByText("Nearly every day")).toBeInTheDocument();
    expect(
      within(item1Row).queryByText(/acute-risk item/i)
    ).not.toBeInTheDocument();
  });

  it("returns to the Worklist when Back is used", async () => {
    const onBack = vi.fn();
    renderView(detail(), { onBack });

    await userEvent.click(
      screen.getByRole("button", { name: /back to worklist/i })
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("offers a Claim action on an Open Flag and invokes it (FR-26)", async () => {
    const onAcknowledge = vi.fn();
    renderView(detail(), { onAcknowledge });

    expect(screen.getByText(/unclaimed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^claim$/i }));
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it("shows the owner and no Claim action once Acknowledged (FR-26)", () => {
    renderView(
      detail({
        flag: { ...ACUTE_FLAG, status: "Acknowledged" },
        ownerName: "Grace Hopper",
      }),
      { onAcknowledge: vi.fn() }
    );

    expect(screen.getByText(/claimed by grace hopper/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^claim$/i })
    ).not.toBeInTheDocument();
  });

  it("surfaces an already-claimed notice", () => {
    renderView(
      detail({
        flag: { ...ACUTE_FLAG, status: "Acknowledged" },
        ownerName: "Grace Hopper",
      }),
      { notice: { kind: "info", message: "Already claimed by Grace Hopper." } }
    );

    expect(
      screen.getByText(/already claimed by grace hopper/i)
    ).toBeInTheDocument();
  });
});

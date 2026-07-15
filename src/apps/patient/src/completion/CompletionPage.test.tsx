import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedplumProvider } from "@medplum/react";
import { MockClient } from "@medplum/mock";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { CompletionPage } from "./CompletionPage";
import type {
  AccessLinkOpenResult,
  SubmitPatientResponse,
} from "./resolvePatientAccessLink";
import { FIXTURE_INSTRUMENT } from "./fixtures";

// The account-less patient completion page's client seam (ui vitest project):
// drive it through the injectable `resolve`/`submit` functions, never a real
// network call - both post to the Access-link publicWebhook Bot in production
// (#17, ADR-0005).
function renderPage(
  resolve: (token: string) => Promise<AccessLinkOpenResult>,
  token: string | null = "some-token",
  submit: SubmitPatientResponse = vi
    .fn()
    .mockResolvedValue({ status: "submitted", responseId: "qr-1" })
) {
  const medplum = new MockClient({ profile: null });
  const createSpy = vi.spyOn(medplum, "createResource");
  const updateSpy = vi.spyOn(medplum, "updateResource");
  const patchSpy = vi.spyOn(medplum, "patchResource");
  const utils = render(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <CompletionPage token={token} resolve={resolve} submit={submit} />
      </MantineProvider>
    </MedplumProvider>
  );
  return { ...utils, createSpy, updateSpy, patchSpy, submit };
}

function radioFor(
  container: HTMLElement,
  linkId: string,
  optionLabel: string
): HTMLElement {
  const label = container.querySelector(`#${linkId}-label`);
  const wrapper = label?.closest(".mantine-InputWrapper-root");
  if (!wrapper) {
    throw new Error(`No item wrapper found for "${linkId}"`);
  }
  return within(wrapper as HTMLElement).getByRole("radio", {
    name: optionLabel,
  });
}

describe("CompletionPage: open (FR-11, FR-13, NFR-5)", () => {
  it("renders the blank Instrument for a valid, unused, unexpired link", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    renderPage(resolve);

    expect(
      await screen.findByRole("heading", { name: "Fixture Instrument" })
    ).toBeInTheDocument();
    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.getByText("Acute question")).toBeInTheDocument();
    expect(resolve).toHaveBeenCalledWith("some-token");

    // PHI-minimal: no patient identity ever appears on the page.
    expect(screen.queryByText(/patient/i)).not.toBeInTheDocument();
  });

  it("shows a friendly page, not an error or blank form, for an unknown token", async () => {
    const resolve = vi.fn().mockResolvedValue({ status: "not-found" });
    renderPage(resolve);

    expect(
      await screen.findByRole("heading", { name: "This link isn't valid" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Fixture Instrument" })
    ).not.toBeInTheDocument();
  });

  it("shows a friendly page for an expired/used token", async () => {
    const resolve = vi.fn().mockResolvedValue({ status: "expired" });
    renderPage(resolve);

    expect(
      await screen.findByRole("heading", {
        name: "This link is no longer available",
      })
    ).toBeInTheDocument();
  });

  it("shows a friendly page (not a crash) when resolution itself fails", async () => {
    const resolve = vi.fn().mockRejectedValue(new Error("network down"));
    renderPage(resolve);

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" })
    ).toBeInTheDocument();
  });

  it("treats a missing token the same as an unknown one, without calling resolve", async () => {
    const resolve = vi.fn();
    renderPage(resolve, null);

    expect(
      await screen.findByRole("heading", { name: "This link isn't valid" })
    ).toBeInTheDocument();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("reads as 'start again', not a resumed draft (FR-8/FR-16)", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    renderPage(resolve);

    expect(await screen.findByText(/you'll start again/i)).toBeInTheDocument();
  });
});

describe("CompletionPage: completeness gate (FR-14)", () => {
  it("blocks submit until every item is answered, then posts the answers", async () => {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const submit = vi
      .fn()
      .mockResolvedValue({ status: "submitted", responseId: "qr-1" });
    const { container } = renderPage(resolve, "some-token", submit);

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();

    await user.click(radioFor(container, "q1", "Yes"));
    expect(button).toBeDisabled();

    await user.click(radioFor(container, "q2", "No"));
    expect(button).toBeEnabled();

    await user.click(button);
    // The domain answers are posted for exactly the answered items (FR-13).
    expect(submit).toHaveBeenCalledWith({
      token: "some-token",
      answers: [
        { linkId: "q1", answerCode: "yes" },
        { linkId: "q2", answerCode: "no" },
      ],
    });
  });
});

describe("CompletionPage: submit outcomes (FR-8/FR-13)", () => {
  async function completeAndSubmit(
    submit: SubmitPatientResponse
  ): Promise<void> {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const { container } = renderPage(resolve, "some-token", submit);
    await screen.findByRole("heading", { name: "Fixture Instrument" });
    await user.click(radioFor(container, "q1", "Yes"));
    await user.click(radioFor(container, "q2", "No"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
  }

  it("shows a confirmation when the Response is accepted", async () => {
    await completeAndSubmit(
      vi.fn().mockResolvedValue({ status: "submitted", responseId: "qr-1" })
    );
    expect(
      await screen.findByRole("heading", {
        name: "Thank you - your answers were submitted",
      })
    ).toBeInTheDocument();
  });

  it("shows the friendly 'no longer available' page when the link was already used", async () => {
    await completeAndSubmit(vi.fn().mockResolvedValue({ status: "used" }));
    expect(
      await screen.findByRole("heading", {
        name: "This link is no longer available",
      })
    ).toBeInTheDocument();
  });

  it("shows a retryable inline error when the submit call itself fails", async () => {
    await completeAndSubmit(vi.fn().mockRejectedValue(new Error("network")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't submit your answers/i
    );
    // The form is still there to retry, not a terminal page.
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });
});

describe("CompletionPage: Crisis Response (FR-15)", () => {
  it("shows the Crisis Response the instant the acute-risk item is answered positively", async () => {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const { container } = renderPage(resolve);

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(radioFor(container, "q2", "Yes"));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Help is available right now.")
    ).toBeInTheDocument();
    expect(within(alert).getByText(/988/)).toBeInTheDocument();
  });

  it("does not show the Crisis Response for a negative answer to the acute-risk item", async () => {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const { container } = renderPage(resolve);

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    await user.click(radioFor(container, "q2", "No"));
    await user.click(radioFor(container, "q1", "Yes"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not fire on a positive answer to a non-acute-risk item", async () => {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const { container } = renderPage(resolve);

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    await user.click(radioFor(container, "q1", "Yes"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("creates no server resource - the Crisis Response is client-side only (FR-15/FR-20 guard)", async () => {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const { container, createSpy, updateSpy, patchSpy } = renderPage(resolve);

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    await user.click(radioFor(container, "q2", "Yes"));
    await screen.findByRole("alert");
    await user.click(radioFor(container, "q1", "Yes"));

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled();
  });
});

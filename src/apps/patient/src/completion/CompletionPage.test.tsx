import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedplumProvider } from "@medplum/react";
import { MockClient } from "@medplum/mock";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { CompletionPage } from "./CompletionPage";
import type { AccessLinkOpenResult } from "./resolvePatientAccessLink";
import { FIXTURE_INSTRUMENT } from "./fixtures";

// The account-less patient completion page's client seam (ui vitest project):
// drive it through the injectable `resolve` function, never a real network
// call (#16; the real resolution mechanism lands with #17 - see the resolver's
// own doc comment and the #16 issue comment).
function renderPage(
  resolve: (token: string) => Promise<AccessLinkOpenResult>,
  token: string | null = "some-token",
  onSubmit?: () => void
) {
  const medplum = new MockClient({ profile: null });
  const createSpy = vi.spyOn(medplum, "createResource");
  const updateSpy = vi.spyOn(medplum, "updateResource");
  const patchSpy = vi.spyOn(medplum, "patchResource");
  const utils = render(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <CompletionPage token={token} resolve={resolve} onSubmit={onSubmit} />
      </MantineProvider>
    </MedplumProvider>
  );
  return { ...utils, createSpy, updateSpy, patchSpy };
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
  it("blocks submit until every item is answered, then allows it", async () => {
    const user = userEvent.setup();
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    const onSubmit = vi.fn();
    const { container } = renderPage(resolve, "some-token", onSubmit);

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();

    await user.click(radioFor(container, "q1", "Yes"));
    expect(submit).toBeDisabled();

    await user.click(radioFor(container, "q2", "No"));
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledOnce();
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

import { render, screen } from "@testing-library/react";
import { MockClient } from "@medplum/mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { FIXTURE_INSTRUMENT } from "./completion/fixtures";

/** The banner's copy, as a patient reads it (ADR-0012's demo access model). */
const DEMO_BANNER = /public demo - synthetic data only\./i;

// The account-less patient app shell: no SignInForm, no ProtectedRoute
// (ADR-0010 A3) - it goes straight to the completion page.
describe("Patient app shell", () => {
  it("has no sign-in gate - it renders the completion page directly", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });
    render(
      <App
        medplum={new MockClient({ profile: null })}
        token="some-token"
        resolve={resolve}
      />
    );

    expect(
      await screen.findByRole("heading", { name: "Fixture Instrument" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  it("shows the friendly not-found page when the URL has no token", async () => {
    render(<App medplum={new MockClient({ profile: null })} token={null} />);

    expect(
      await screen.findByRole("heading", { name: "This link isn't valid" })
    ).toBeInTheDocument();
  });
});

// The public-demo notice (T18): a build flag the hosted deploy sets, so it is on
// every screen of a demo build and on none of a local one.
describe("Patient app demo banner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the banner above the questionnaire when the demo flag is on", async () => {
    vi.stubEnv("VITE_DEMO_BANNER", "true");
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });

    render(
      <App
        medplum={new MockClient({ profile: null })}
        token="some-token"
        resolve={resolve}
      />
    );

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    expect(screen.getByText(DEMO_BANNER)).toBeInTheDocument();
  });

  it("renders no banner when the demo flag is off (local dev default)", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ status: "valid", instrument: FIXTURE_INSTRUMENT });

    render(
      <App
        medplum={new MockClient({ profile: null })}
        token="some-token"
        resolve={resolve}
      />
    );

    await screen.findByRole("heading", { name: "Fixture Instrument" });
    expect(screen.queryByText(DEMO_BANNER)).not.toBeInTheDocument();
  });
});

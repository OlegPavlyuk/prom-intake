import { render, screen } from "@testing-library/react";
import { MockClient } from "@medplum/mock";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { FIXTURE_INSTRUMENT } from "./completion/fixtures";

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

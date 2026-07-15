import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockClient } from "@medplum/mock";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

// The app's component seam (the `ui` vitest project): drive the shell through a
// MockClient in a known session state and assert the auth gate, not Medplum's
// internal form markup. A `null` profile stands in for "no session"; the default
// MockClient is signed in.
describe("Coordinator app shell", () => {
  it("routes unauthenticated visitors to the sign-in form", async () => {
    render(<App medplum={new MockClient({ profile: null })} />);

    expect(
      await screen.findByRole("heading", { name: /coordinator sign in/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign out/i })
    ).not.toBeInTheDocument();
  });

  it("renders the authenticated coordinator page when signed in", async () => {
    render(<App medplum={new MockClient()} />);

    expect(
      await screen.findByRole("button", { name: /sign out/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /coordinator sign in/i })
    ).not.toBeInTheDocument();
  });

  it("ends the Medplum session when the sign-out control is used", async () => {
    const medplum = new MockClient();
    const signOut = vi.spyOn(medplum, "signOut").mockResolvedValue(undefined);
    render(<App medplum={medplum} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /sign out/i })
    );

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("closes the gate back to sign-in when the session ends", async () => {
    // `signOut()` ultimately clears the profile; assert the gate reacts to that
    // session loss (MockClient's own signOut does not touch its profile stub).
    const medplum = new MockClient();
    render(<App medplum={medplum} />);
    await screen.findByRole("button", { name: /sign out/i });

    act(() => {
      medplum.setProfile(undefined);
    });

    expect(
      await screen.findByRole("heading", { name: /coordinator sign in/i })
    ).toBeInTheDocument();
  });
});

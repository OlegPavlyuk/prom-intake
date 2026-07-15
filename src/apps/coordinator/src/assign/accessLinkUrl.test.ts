import { describe, expect, it } from "vitest";
import { buildAccessLinkUrl } from "./accessLinkUrl";

// Pure delivery-URL assembly (the Coordinator app's job per ADR-0010). Asserted
// off-server in the `unit` project - no DOM, no Medplum.
describe("buildAccessLinkUrl", () => {
  it("appends the raw token as a `token` query param", () => {
    expect(buildAccessLinkUrl("https://patient.example/", "abc123")).toBe(
      "https://patient.example/?token=abc123"
    );
  });

  it("handles a base URL without a trailing slash", () => {
    expect(buildAccessLinkUrl("https://patient.example", "abc123")).toBe(
      "https://patient.example/?token=abc123"
    );
  });

  it("preserves an existing path on the base URL", () => {
    expect(buildAccessLinkUrl("https://app.example/complete", "abc123")).toBe(
      "https://app.example/complete?token=abc123"
    );
  });

  it("percent-encodes token characters that are unsafe in a query", () => {
    expect(buildAccessLinkUrl("https://patient.example/", "a b/c+d")).toBe(
      "https://patient.example/?token=a+b%2Fc%2Bd"
    );
  });
});

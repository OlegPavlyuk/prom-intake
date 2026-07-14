import { describe, expect, it } from "vitest";
// Tests exercise the package through its entry point (its seam), never its
// internals - the same rule everyone else follows.
import { greet } from "../index.js";

describe("example package", () => {
  it("greets through the public entry point", () => {
    expect(greet("PROM")).toBe("Hello, PROM!");
  });
});

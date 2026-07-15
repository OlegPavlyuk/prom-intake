import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Three test projects share one runner (ADR-0008, ADR-0010, testing-strategy.md):
//  - `unit`        - pure domain logic, off-server, node env, runs on every commit.
//  - `integration` - exercises real Medplum; files are named `*.integration.test.ts`.
//  - `ui`          - client-app React components (`src/apps/**/*.test.tsx`) in jsdom.
// The node projects stay DOM-free (they never match `.tsx`); only `ui` loads jsdom
// and the React plugin, keeping the domain pyramid off the DOM.
// `vitest run` (npm test) runs all three; `--project unit|integration|ui` runs one.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["src/test-support/setup-integration.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/apps/**/*.test.tsx"],
          setupFiles: ["src/test-support/setup-ui.ts"],
        },
      },
    ],
  },
});

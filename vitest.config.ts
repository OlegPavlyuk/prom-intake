import { defineConfig } from "vitest/config";

// Two test projects share one runner (ADR-0008, testing-strategy.md):
//  - `unit`        - pure domain logic, off-server, runs on every commit.
//  - `integration` - exercises real Medplum; files are named `*.integration.test.ts`.
// `vitest run` (npm test) runs both; `--project unit|integration` runs one.
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
    ],
  },
});

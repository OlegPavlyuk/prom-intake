// Surfaces the `@testing-library/jest-dom` matcher types (toBeInTheDocument, ...)
// to TypeScript for every `ui`-project test under `src/apps`. The matchers are
// registered at runtime by `src/test-support/setup-ui.ts`; this ambient import
// makes their type augmentation of vitest's `expect` visible at compile time.
import "@testing-library/jest-dom/vitest";

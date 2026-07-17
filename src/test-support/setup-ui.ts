/// <reference lib="dom" />
// Setup for the `ui` vitest project (jsdom). Adds jest-dom matchers and the
// browser APIs Mantine's hooks reach for that jsdom does not implement.
// This is UI test infra, so it opts into the DOM lib locally rather than
// widening the base node-only tsconfig (ADR-0010: the backend stays DOM-free).
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests so a leftover authenticated shell never
// bleeds into the next test's assertions.
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; Mantine's responsive hooks (e.g. AppShell) call it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList,
});

// jsdom has no ResizeObserver; Mantine's ScrollArea (used by Select/dropdown
// popovers) constructs one on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

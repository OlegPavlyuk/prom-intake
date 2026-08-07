import { Box, Text } from "@mantine/core";

// The public-demo notice (ADR-0012, T18). Deliberately duplicated in the patient
// app rather than shared: the two apps are separate, credential-isolated bundles
// (ADR-0010 A2, enforced by `apps-are-credential-isolated`) and a React component
// cannot live in `src/packages/**` (the backend stays DOM-free, ADR-0010 A4). The
// copy is the contract; each app owns how it seats the strip in its own chrome.

/**
 * Height the banner claims, per breakpoint. The sentence fits one line on a
 * normal screen and wraps to two on a phone, so the reserved height has to
 * follow - the coordinator shell hands these same values to `AppShell`, whose
 * fixed header the banner rides in.
 */
export const DEMO_BANNER_HEIGHT = { base: 56, sm: 36 } as const;

/**
 * The notice itself, as one string literal rather than JSX text, so it survives
 * bundling intact - the hosted smoke check greps the built bundle for it to prove
 * the deployed demo is actually labelled (`scripts/smoke-hosted.ts`).
 */
const BANNER_COPY =
  "Public demo - synthetic data only. Do not enter real health information.";

/**
 * Is this a public-demo build? Driven by the non-secret `VITE_DEMO_BANNER` build
 * flag, which the hosted deploy sets and local dev leaves unset - so `dev:full`
 * is banner-free by default. Read at render time (not at module load) so it stays
 * a plain build input and the UI tests can drive both states.
 */
export function demoBannerEnabled(): boolean {
  return import.meta.env.VITE_DEMO_BANNER === "true";
}

/**
 * Persistent, non-dismissable statement that this deployment is a public demo on
 * synthetic data. **Presentation only**: it creates no resource, reads nothing,
 * and alters no flow. It is emphatically not the Crisis Response (FR-15) - that
 * is a different mechanism with a different job, and the two stay uncoupled.
 */
export function DemoBanner(): JSX.Element | null {
  if (!demoBannerEnabled()) {
    return null;
  }

  return (
    <Box
      h={DEMO_BANNER_HEIGHT}
      px="md"
      bg="yellow.2"
      c="dark.8"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderBottom: "1px solid var(--mantine-color-yellow-4)",
      }}
    >
      <Text size="sm" fw={600} ta="center" lh={1.25}>
        {BANNER_COPY}
      </Text>
    </Box>
  );
}

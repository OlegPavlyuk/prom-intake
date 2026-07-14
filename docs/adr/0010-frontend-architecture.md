---
status: accepted
date: 2026-07-14
---

# Frontend architecture: two credential-isolated Vite/React SPAs on Medplum's built-in auth

The platform has **two frontend surfaces** with opposite trust postures: an **authenticated
Coordinator app** (assign, Worklist) and an **unauthenticated, PHI-minimal Patient completion
page** ([ADR-0005](0005-access-link-security-model.md)). No frontend existed before this decision -
the repo was node-only (`@medplum/core` + `@medplum/fhirtypes`, no DOM). This ADR fixes the client
framework, the repo layout for UI code alongside the existing `src/packages/` deep modules, and how
the Coordinator app integrates Medplum's built-in auth (FR-31). It is the decision [#28] is blocked
on.

Mechanical "how it will be" detail (SignInForm/ProtectedRoute/signOut wiring, the vitest project
split, per-app Vite configs, delivery-URL assembly, config vars) lives in
[`architecture/overview.md`](../architecture/overview.md),
[`infrastructure.md`](../architecture/infrastructure.md),
[`testing-strategy.md`](../architecture/testing-strategy.md), and
[`module-boundaries.md`](../architecture/module-boundaries.md), not here.

## Decisions and rationale

- **Vite + React + `@medplum/react` (A1).** Static SPA(s) built with Vite; React as the UI library;
  `@medplum/react` for the Medplum integration. Decisive factor: `@medplum/react` ships the two
  things both surfaces need and we would otherwise hand-roll - the auth plumbing
  (`MedplumProvider`, `useMedplum`, `SignInForm`, with token refresh/session persistence handled)
  **and** `QuestionnaireForm`, a FHIR `Questionnaire` renderer used to render the blank Instrument
  on both the assign flow and the Patient page (#16). It is React-only, which is the largest reason
  to stay on Medplum's stack. *Rejected:* **Next.js** (SSR we do not need for an authenticated
  internal tool + an account-less page with no SEO; an SSR server is a new place PHI could transit,
  cutting against the PHI-minimal Patient page); **a non-React runtime** (Svelte/Vue/Solid - throws
  away `@medplum/react`'s auth context and Questionnaire renderer and puts a portfolio project whose
  goal is *idiomatic Medplum* off the idiomatic path).

- **Two separate, credential-isolated builds (A2).** The Coordinator app and the Patient page are
  **two independent Vite bundles**, not two routes in one SPA. The Patient surface must be
  unauthenticated and PHI-minimal; making it a separate build means its bundle *physically cannot*
  contain Coordinator code, routes, or an authenticated client - the PHI-minimal guarantee (NFR-5,
  ADR-0005) becomes a **build boundary, not a convention**. The cost (two build targets) is accepted
  for that guarantee. Both bundles import the same domain packages; the Patient bundle uses only the
  account-less open/submit path.

- **Direct browser-to-Medplum via built-in auth; no backend-for-frontend (A3).** The Coordinator app
  talks to Medplum's FHIR API directly under the logged-in coordinator's own session and
  `AccessPolicy` (the `coordUI --> authenticated FHIR --> fhir` edge in the overview). Login is
  `@medplum/react`'s `SignInForm` against Medplum's **built-in email/password auth** for v1
  (external IdP/Google is a later config swap; FR-31 only requires "built-in auth"). The
  authenticated `useMedplum()` client is passed straight into the domain modules
  (`createAssignment(medplum, ...)`) - they already take a `MedplumClient` and are isomorphic, so no
  new adapter or proxy is introduced. **Medplum is the auth boundary**; we do not write a server that
  would become a second trust boundary and a place PHI transits. The Patient app wraps a
  `MedplumProvider` holding an **unauthenticated, credential-free client** (needed only for
  `QuestionnaireForm`); it has no `SignInForm`, no `ProtectedRoute`, and no stored session, so "the
  only unauthenticated entry point is the submit Bot" (NFR-5) holds at the build level.

- **Single-package monorepo; the DOM-free backend boundary is enforced by lint, not by workspaces
  (A4).** UI code lives under `src/apps/{coordinator,patient}/` as siblings to `src/packages/`,
  staying one root `package.json`. The invariant we actually need is *directional* - the backend
  (domain packages + Bots) must never depend on React/DOM - and it is enforced two ways we already
  run in CI: a **dependency-cruiser rule** forbidding `src/packages/**` from importing
  `react`/`react-dom`/`@medplum/react` or anything under `src/apps/**`, and a dedicated
  `src/apps/tsconfig.json` that turns on the DOM `lib` for apps while the base `tsconfig` stays
  node-only (so a Bot referencing `document` fails typecheck). A second cruiser rule forbids the two
  apps from importing each other, making A2's isolation lint-enforced. *Rejected for v1:* **npm
  workspaces** - their one benefit over this (independent dependency trees) solves problems we do not
  have (no independent versioning/publishing, one deploy, one React version), while adding
  per-workspace configs, hoisting, and a rewrite of the current single-package scripts/CI. Making
  the boundary an explicit *rule* is stronger documentation than a dependency-graph accident.

## Consequences

- The UI sits at the **top** of the dependency graph: apps import domain packages through their
  entry points (already permitted by the existing `entrypoint-boundary-from-app` cruiser rule);
  nothing in `src/packages/**` depends on the apps. The deep-module boundary (P6) and "no module
  reads another's FHIR directly" hold for UI code unchanged - the UI is just another consumer of the
  module interfaces.
- The **Coordinator app is the delivery layer**: `issueAccessLink` deliberately returns a raw token,
  not a URL, so the Coordinator app assembles the patient-facing Access link from it. The
  Access-link module stays delivery-agnostic (a future SMS/email/portal channel never touches it).
  See [`module-boundaries.md`](../architecture/module-boundaries.md).
- Introducing DOM/React means the test runner gains a third vitest project (`ui`, jsdom) beside the
  existing `unit`/`integration` (node) projects, keeping the node pyramid DOM-free. Browser-E2E
  tooling (Playwright etc.) is **deferred** to the tracer-bullet E2E ticket, not decided here.
- New runtime dependencies enter the repo: `react`, `react-dom`, `@medplum/react`, `vite`, and
  jsdom/testing-library dev deps - scoped to the apps by the boundary rule above.

## Revisit when

Migrate to **npm workspaces** (or split the apps into their own repos) if any of these enter scope:
the two apps need divergent React/dependency versions; a domain package needs to be published or
versioned independently; or a real backend-for-frontend becomes necessary (e.g. server-side session
handling or an SSR requirement), which would also reopen A3.

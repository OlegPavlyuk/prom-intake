# Infrastructure

**Status:** Accepted (v1) - established at the first-code milestone (T1, issue #13). Covers the
Medplum test project used by the integration harness ([ADR-0008](../adr/0008-integration-tests-against-real-medplum.md)).
Application/deploy environments are still TBD.

## Environments

| Environment | Medplum | Credentials |
| ----------- | ------- | ----------- |
| **Local dev** | Self-contained via [`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) (Postgres + Redis + `medplum-server`) | `npm run medplum:provision` writes `.env` |
| **CI** | Same compose stack, ephemeral per run | Provisioned at runtime; no stored secret |
| dev / staging / prod (app) | _TBD_ | _TBD_ |

## Local Medplum test project

The integration seam every later ticket builds on. Bring it up and provision credentials:

```bash
docker compose -f infra/medplum/docker-compose.yml up -d --wait   # Postgres + Redis + Medplum
npm run medplum:provision                                          # writes .env
npm run test:integration                                           # real round-trip

docker compose -f infra/medplum/docker-compose.yml down -v         # tear down + wipe volumes
```

`scripts/provision-medplum.ts` waits for the server healthcheck, registers a fresh project (the dev
config sets `registerEnabled` and has no reCAPTCHA keys, so registration needs no human step),
creates a `ClientApplication` **via the admin endpoint** (so it also gets its `ProjectMembership` -
a plain FHIR create would omit it and the client-credentials login would fail), and writes the three
env vars below. Re-running it provisions a new project + credentials.

### Hosted Medplum (alternative)

Skip docker-compose and point at any Medplum test project by setting the env vars yourself. Create a
`ClientApplication` in that project and copy its id/secret. See [`.env.example`](../../.env.example).

## Configuration

The harness reads exactly three variables (`src/packages/test-harness/config.ts`); credentials never
land in the repo (`.env` is gitignored):

| Variable | Meaning |
| -------- | ------- |
| `MEDPLUM_BASE_URL` | Base URL of the Medplum server (e.g. `http://localhost:8103/`) |
| `MEDPLUM_CLIENT_ID` | `ClientApplication` id (client-credentials grant) |
| `MEDPLUM_CLIENT_SECRET` | `ClientApplication` secret |

When these are absent the integration suite **skips loudly** rather than reporting a false green, so
`npm test` stays green on a box without Medplum while CI runs the real thing.

## Client apps

Settled in [ADR-0010](../adr/0010-frontend-architecture.md). The frontend is two **Vite + React**
SPAs under `src/apps/`, kept in the **single-package** repo (no npm workspaces in v1):

| App | Path | Build | Auth |
| --- | ---- | ----- | ---- |
| Coordinator app | `src/apps/coordinator/` | `npm run build:coordinator` (own `vite.config.ts`) -> static bundle | Medplum built-in (authenticated) |
| Patient completion page | `src/apps/patient/` | `vite build` (own `vite.config.ts`) -> static bundle | none (account-less, PHI-minimal) |

Each app has its own `vite.config.ts` whose `root` is pinned to the app directory, so it is launched
from the repo root via `--config`. Coordinator scripts (the patient app's land with #16):

```bash
npm run dev:coordinator       # Vite dev server (http://localhost:3000)
npm run build:coordinator     # static bundle -> src/apps/coordinator/dist/
npm run preview:coordinator   # serve the built bundle
```

- **Logging in during verification.** Built-in auth (`SignInForm`) needs a real email/password user;
  `npm run medplum:provision` only mints client-credentials for the integration harness.
  `npm run medplum:dev-user` registers a known-credential user in a throwaway project and writes
  `.dev-user.json` (gitignored). The browser verification recipe is the `verifier-ui` skill
  ([`docs/architecture/testing-strategy.md`](testing-strategy.md)); Playwright is installed
  ephemerally per session, not committed (deferred to the E2E ticket, [ADR-0010](../adr/0010-frontend-architecture.md)).

- **DOM-free backend boundary.** The base [`tsconfig.json`](../../tsconfig.json) stays node-only (it
  `exclude`s `src/apps`); a dedicated `src/apps/tsconfig.json` adds the DOM `lib` for apps, so
  `npm run typecheck` runs both. A dependency-cruiser rule forbids `src/packages/**` from importing
  `react`/`react-dom`/`@medplum/react` or anything under `src/apps/**` (and forbids the two apps
  importing each other), so Bots and domain modules never pull in DOM/React. Enforced by
  `npm run lint:boundaries` in CI + pre-commit. Client React components are tested in the `ui` vitest
  project (jsdom); the `unit`/`integration` node projects stay DOM-free.
- **Config.** The Coordinator app needs the Patient-app base URL (to assemble Access-link URLs, from
  #29) and the Medplum base URL; both are Vite build/runtime env vars (`VITE_*`), never secrets -
  today it reads `VITE_MEDPLUM_BASE_URL` (default `http://localhost:8103/`), documented in
  [`src/apps/coordinator/.env.example`](../../src/apps/coordinator/.env.example). Concrete
  hosting/deploy targets for the two static bundles are _TBD_ (see below).

## Cloud resources

_TBD - no cloud footprint yet; the local/CI Medplum is containerised. Filled when a hosted Medplum
and app hosting are chosen._

## Infrastructure as Code

_TBD - `infra/medplum/` holds the compose definition today; broader IaC (Terraform/CDK) is deferred
until there is a cloud deploy target._

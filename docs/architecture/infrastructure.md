# Infrastructure

**Status:** Accepted (v1) - established at the first-code milestone (T1, issue #13). Covers the
Medplum test project used by the integration harness ([ADR-0008](../adr/0008-integration-tests-against-real-medplum.md)).
Application/deploy environments are still TBD.

## Environments

| Environment | Medplum | Credentials |
| ----------- | ------- | ----------- |
| **Local dev** | Self-contained via [`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) (Postgres + Redis + `medplum-server`) | `npm run medplum:provision` writes `.env` |
| **CI** | Same compose stack, ephemeral per run | Provisioned at runtime; no stored secret |
| **Public demo** (planned, spec #55) | Same compose stack on one GCE VM behind Caddy/HTTPS ([ADR-0012](../adr/0012-gcp-public-demo-deployment.md)) | Medplum admin + demo login in Actions secrets; cloud auth is keyless (WIF) |

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

### Full local app run (single project, `npm run dev:full`)

The integration harness only needs client credentials, but **running the whole app** (coordinator +
patient + both Bots + seeded PHQ-9) needs one project that also carries a **human login** for the
coordinator's `SignInForm` - Medplum resources are project-scoped, so the login project must be the
same project that holds the seeded Instrument and the Bot-raised Flags. The three provisioning paths:

| Script | Creates | Used by |
| ------ | ------- | ------- |
| `medplum:provision` | client credentials only (own project) | integration harness / CI |
| `medplum:dev-user` | a human login only (own project) | `verifier-ui` auth checks |
| `medplum:provision-local` | **one project with both** - writes `.env` + `.dev-user.json` | the full local app run |

`scripts/provision-local.ts` registers a user + project, then mints a `ClientApplication` in that
same project via the admin endpoint (the registered user is its admin). It is idempotent: a re-run
reuses the project when the existing `.env` credentials still authenticate against the live server,
and re-provisions cleanly after `docker compose down -v` (pass `--fresh` to force a new one).

`npm run dev:full` (`scripts/dev-full.ts`) is the single documented entry point. It brings up the
Docker Medplum stack, runs `provision-local`, seeds the PHQ-9, deploys both Bots + the Subscription
(reusing the idempotent `medplum:seed` / `medplum:deploy-bots` scripts), then runs both dev servers
concurrently and prints the coordinator login + URLs. See the README's **Run the whole app locally**.

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
| Patient completion page | `src/apps/patient/` | `npm run build:patient` (own `vite.config.ts`) -> static bundle | none (account-less, PHI-minimal) |

Each app has its own `vite.config.ts` whose `root` is pinned to the app directory, so it is launched
from the repo root via `--config`. Each also pins a distinct `cacheDir` (`<app>/node_modules/.vite`):
the two apps share the repo's single `node_modules`, so the default shared cache makes their two dev
servers clobber each other's optimized deps when run together (browser `504 Outdated Optimize Dep`) -
which the full-app flow (both servers up at once) needs.

```bash
npm run dev:coordinator       # Vite dev server (http://localhost:3000)
npm run build:coordinator     # static bundle -> src/apps/coordinator/dist/
npm run preview:coordinator   # serve the built bundle

npm run dev:patient           # Vite dev server (http://localhost:3001)
npm run build:patient         # static bundle -> src/apps/patient/dist/
npm run preview:patient       # serve the built bundle
```

- **Patient app's server touchpoint is the Access-link Bot (#17).** The patient client is
  unauthenticated and credential-free (ADR-0010 A3); its one server touchpoint is the `publicWebhook`
  Bot (below), which serves both `open` (validate + render the blank Instrument) and `submit` (atomic
  consume). `src/apps/patient/src/completion/resolvePatientAccessLink.ts` posts to that webhook
  (`VITE_ACCESS_LINK_WEBHOOK_URL`, written by `npm run medplum:deploy-bots`). This replaces the #16
  documented stub that always resolved `"not-found"`.

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
- **Config.** The Coordinator app reads two non-secret Vite build/runtime env vars (`VITE_*`):
  `VITE_MEDPLUM_BASE_URL` (the Medplum server it authenticates against; default
  `http://localhost:8103/`) and `VITE_PATIENT_APP_BASE_URL` (the Patient completion page base used to
  assemble the patient-facing Access-link URL from an issued token - the Coordinator app is the
  delivery layer, ADR-0010; default `http://localhost:3001/`). Both are documented in
  [`src/apps/coordinator/.env.example`](../../src/apps/coordinator/.env.example). Concrete
  hosting/deploy targets for the two static bundles are _TBD_ (see below).

## Medplum Bots

The Access-link `submit` Bot ([ADR-0005](../adr/0005-access-link-security-model.md),
[ADR-0009](../adr/0009-bots-as-adapters-over-shared-domain-logic.md)) is the first Bot in the repo,
so #17 established the deployment pipeline. There is no Medplum-documented "tokenized link, no
account" pattern, so the whole thing is invented and carefully bounded.

- **Runtime - VM context, self-hosted.** Bots run in-process on the local/CI Medplum via the
  `vmcontext` runtime (`Bot.runtimeVersion: "vmcontext"`, `publicWebhook: true`). The server must set
  `vmContextBotsEnabled: true` (in [`medplum.config.json`](../../infra/medplum/docker-compose.yml)'s
  mounted config) **and** the project must have the `bots` feature enabled (a super-admin action).
  The `node:vm` sandbox is not a security boundary - acceptable here because the code is our own and
  the deployment is local/CI only.
- **Deploy script.** `npm run medplum:deploy-bots` (`scripts/deploy-bots.ts`, idempotent):
  1. bundles `src/packages/access-link/bot.ts` into one self-contained CommonJS module with
     [esbuild](https://esbuild.github.io/) - with a banner mapping Node's WebCrypto onto
     `globalThis.crypto` (the sandbox exposes `require('node:crypto')` but not a global `crypto`, and
     token hashing is isomorphic Web Crypto) and a footer that re-exports `handler` onto the original
     `exports` (esbuild's CJS wrapper reassigns `module.exports`, which the runner does not read);
  2. as **super admin** (`admin@example.com`/`medplum_admin` by default; override with
     `MEDPLUM_SUPER_ADMIN_EMAIL`/`_PASSWORD`), enables the `bots` project feature - this **must**
     happen before any `$deploy`, or the deploy is rejected with `Bots not enabled`;
  3. creates the Bot **and** its scoped `AccessPolicy` **as the client-credentials app** (whose home
     is the target project) so both are homed alongside the tokens/assignments the Bot must reach - a
     Bot created via the admin endpoint lands in the caller's project, which for super admin is the
     wrong one;
  4. `$deploy`s the bundled code;
  5. as **super admin**, creates the Bot's `ProjectMembership` with the `AccessPolicy` attached (a
     public Bot **must** have one; the client-credentials app cannot create memberships);
  6. writes `VITE_ACCESS_LINK_WEBHOOK_URL=<baseUrl>/webhook/<membership-id>` to
     `src/apps/patient/.env.local` (gitignored) for the patient app.
- **Invocation.** Unauthenticated `POST /webhook/{ProjectMembership.id}` with a JSON body
  `{ operation: "open" | "submit", token, answers? }`. The Bot is a thin adapter (ADR-0009) over the
  Access-link module's `openAccessLink` / `submitAccessLinkResponse`.
- **CORS / same-origin.** Medplum does **not** send CORS headers on `/webhook` (it is a
  server-to-server callback endpoint), so the browser cannot call it cross-origin. The patient app
  therefore calls it **same-origin** at a relative `/webhook/*` path: the Vite dev server proxies
  `/webhook` to Medplum (`src/apps/patient/vite.config.ts`), and a production deployment serves the
  static bundle behind a reverse proxy that routes `/webhook` the same way (deploy target _TBD_).
- **AccessPolicy (the security envelope, NFR-5).** Scoped so a leaked link can at most: create one
  `QuestionnaireResponse` (create-only, no read - answers cannot be harvested), burn its own token
  `Basic`, and complete the bound assignment `Task` (write restricted to `code=assignment`, never
  Flags). No `Patient`/`Observation` access at all. See [security.md](security.md).
- **Deploy/prod.** A hosted deployment would use the Medplum CLI (`medplum bot deploy`) or Lambda
  runtime and a reviewed `AccessPolicy`, not the dev super-admin path above. _TBD with the app deploy
  target._

### Scoring Bot (#19, Subscription-fired)

The second Bot (`src/packages/scoring/bot.ts`, [ADR-0004](../adr/0004-scoring-and-trigger-engine.md)/
[ADR-0009](../adr/0009-bots-as-adapters-over-shared-domain-logic.md)) is deployed by the **same**
`npm run medplum:deploy-bots` step (idempotent). Unlike the submit Bot it is **not** a public webhook -
it is invoked by a **Subscription** on `QuestionnaireResponse` creation:

- **Bot.** `vmcontext`, deployed with the same esbuild bundle pipeline as the submit Bot. It scores a
  submitted Response and persists the results (always the Score `Observation`; a Flag `Task` per fired
  Trigger) idempotently under at-least-once delivery.
- **Subscription.** `criteria: QuestionnaireResponse`, `channel.type: rest-hook`, `channel.endpoint:
  Bot/{id}`. Instrument-agnostic (the Bot resolves the Instrument from the Response and no-ops any it
  cannot score), so onboarding another Instrument needs no Subscription change.
- **AccessPolicy (least privilege).** Read the Instrument (`Questionnaire` + config `Basic`) and the
  Response; create the Score `Observation`; create Flag `Task`s (scoped to `code=flag`); and
  read/update the assignment `Task` it re-asserts complete (scoped to `code=assignment`, never
  create). No `Patient` access - it references patients by id only. The Bot runs as itself (its own
  `ProjectMembership` + `AccessPolicy`), a super-admin step like the submit Bot's.
- **Invocation is internal**, so there is no CORS/webhook-path concern; nothing is written to a client
  `.env`.

## Cloud resources

Settled in [ADR-0012](../adr/0012-gcp-public-demo-deployment.md) (planned, spec #55): a single GCE
VM runs the compose stack behind Caddy (serving both SPA bundles and proxying Medplum) on three
sslip.io origins (`app.` / `forms.` / `api.`) with automatic Let's Encrypt HTTPS. Time-boxed to the
free-credit window; teardown is `terraform destroy`. This section is filled in with concrete
resources as the spec's tickets land.

## Infrastructure as Code

Terraform in `infra/gcp/` (planned, spec #55; [ADR-0012](../adr/0012-gcp-public-demo-deployment.md)):
VM, static IP, firewall, deploy service account, Workload Identity Federation for GitHub Actions,
GCS state bucket, billing alert. `infra/medplum/` remains the compose definition shared by local,
CI, and the demo VM.

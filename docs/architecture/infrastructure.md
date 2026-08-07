# Infrastructure

**Status:** Accepted (v1) - established at the first-code milestone (T1, issue #13). Covers the
Medplum test project used by the integration harness ([ADR-0008](../adr/0008-integration-tests-against-real-medplum.md))
and the public GCP demo ([Cloud resources](#cloud-resources) substrate + [Hosted runtime](#hosted-runtime),
[ADR-0012](../adr/0012-gcp-public-demo-deployment.md)). The CD pipeline that runs the deploy
unattended is [`cicd.md`](cicd.md#continuous-delivery--deployment).

## Environments

| Environment | Medplum | Credentials |
| ----------- | ------- | ----------- |
| **Local dev** | Self-contained via [`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) (Postgres + Redis + `medplum-server`) | `npm run medplum:provision` writes `.env` |
| **CI** | Same compose stack, ephemeral per run | Provisioned at runtime; no stored secret |
| **Public demo** (GCP) | Same compose stack on one GCE VM behind Caddy ([ADR-0012](../adr/0012-gcp-public-demo-deployment.md)) | Keyless CD via Workload Identity Federation; Medplum admin/demo logins in Actions secrets, no cloud keys ([Cloud resources](#cloud-resources)) |

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

The public portfolio demo runs on a **single Google Compute Engine VM** in
`prom-intake-demo` (EU region, default `europe-west1`), provisioned by Terraform under
[`infra/gcp/`](../../infra/gcp/) per [ADR-0012](../adr/0012-gcp-public-demo-deployment.md). The
substrate (T15) is the VM, its network, its deploy identity, and a cost guardrail; the runtime
(Caddy + the existing compose stack) is [Hosted runtime](#hosted-runtime) (T16); the pipeline that
drives the deploy unattended is [`cicd.md`](cicd.md#continuous-delivery--deployment) (T17).

| Resource | What it is |
| -------- | ---------- |
| VM (`e2-medium`, Debian 12) | Runs the existing [`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) stack behind Caddy. Docker + Compose are installed by a startup script; the VM has a dedicated least-privilege runtime service account (logs/metrics only). |
| Custom VPC + subnet | Default-deny network; nothing is reachable except through the two firewall rules. |
| Reserved static external IP | Stable IP the `sslip.io` hostnames encode - `app.<ip>.sslip.io` (coordinator), `forms.<ip>.sslip.io` (patient), `api.<ip>.sslip.io` (Medplum), preserving ADR-0010 origin isolation. |
| Firewall | 80/443 open to the internet (Caddy front door); **SSH 22 only from the IAP range** `35.235.240.0/20` - there is no public SSH port. |
| Deploy service account + Workload Identity Federation | GitHub Actions (`OlegPavlyuk/prom-intake`) impersonates the deploy SA via WIF to reach the VM over IAP. **No service-account key exists anywhere** (keyless CD, ADR-0012). Its rights are scoped to an IAP-tunnelled OS Login deploy. |
| Billing budget | Alerts on the demo project at 50/90/100% of the configured amount - the credit-window cost guardrail. |

Access the VM (IAP-only, no public 22):

```bash
gcloud compute ssh prom-intake-demo --zone europe-west1-b --tunnel-through-iap --project prom-intake-demo
```

## Infrastructure as Code

All cloud resources above are Terraform in [`infra/gcp/`](../../infra/gcp/); the compose stack under
`infra/medplum/` is unchanged and still defines the Medplum runtime the VM hosts. State lives in a
versioned GCS bucket created by a one-time bootstrap module ([`infra/gcp/bootstrap/`](../../infra/gcp/bootstrap/)).

```bash
# One-time: create the remote-state bucket (its own state is local + gitignored).
cd infra/gcp/bootstrap && terraform init && terraform apply

# Provision / update the substrate (state in the bucket).
cd infra/gcp && terraform init && terraform apply       # idempotent: a second apply plans zero changes

terraform output          # static IP, the three sslip.io hosts, WIF provider name, deploy SA email

# End of the credit window (T19): tear everything down except the state bucket.
terraform destroy
```

The applying identity needs Owner (or equivalent) on `prom-intake-demo` and a budget role on the
billing account; authenticate with `gcloud auth application-default login`. **No secrets are
committed** - `*.tfvars` (except the committed `*.tfvars.example`), state, and the `.terraform/`
plugin cache are gitignored, and the whole design carries zero cloud keys. CI runs
`terraform fmt -check` + `terraform validate` on `infra/gcp/` (validate only, no credentials); see
[`cicd.md`](cicd.md). Full runbook: [`infra/gcp/README.md`](../../infra/gcp/README.md).

## Hosted runtime

The application layer the substrate hosts - the same
[`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) stack CI exercises,
plus **Caddy** as the single public front door. Per
[ADR-0012](../adr/0012-gcp-public-demo-deployment.md). One script deploys it, whether a developer
runs it or [the pipeline](cicd.md#continuous-delivery--deployment) does.

### Topology - Caddy is the only public component

Caddy ([`infra/caddy/Caddyfile`](../../infra/caddy/Caddyfile)) terminates 80/443 for all three
origin-isolated `sslip.io` hosts and reaches Medplum over the private Docker network
(`medplum-server:8103`, never published to the internet):

| Host | Caddy serves |
| ---- | ------------ |
| `app.<ip>.sslip.io` | Coordinator SPA bundle (history-mode fallback to `index.html`) |
| `forms.<ip>.sslip.io` | Patient SPA bundle **plus** `/webhook/*` reverse-proxied to Medplum |
| `api.<ip>.sslip.io` | Reverse proxy to `medplum-server` |

The `forms.` `/webhook/*` route is the one hard topological constraint: Medplum sends no CORS
headers on `/webhook`, so the account-less patient page calls it **same-origin** and Caddy proxies
it to Medplum (ADR-0005; the [Medplum Bots](#medplum-bots) section). The hostnames encode the
reserved static IP, so the Caddyfile is **IP-agnostic** - the deploy script injects the three hosts
as `{$CADDY_*}` environment variables from `terraform output`. Caddy issues Let's Encrypt
certificates automatically over the `sslip.io` wildcard DNS and redirects plain HTTP to HTTPS; the
`caddy_data` volume persists them across restarts (the shared `sslip.io` suffix has rate limits).

### The overlay and the hardened config variant

[`infra/medplum/docker-compose.hosted.yml`](../../infra/medplum/docker-compose.hosted.yml) is layered
**on top of** the base compose file on the VM
(`docker compose -f docker-compose.yml -f docker-compose.hosted.yml up -d --wait`). It only adds the
`caddy` service and a `restart: unless-stopped` on every service - the base stack deploys exactly as
CI runs it. Postgres and Redis keep the base stack's internal-network credentials: they are never
publicly reachable (the firewall opens only 80/443), so the public security boundary is Medplum's
own auth.

That boundary is hardened by a deploy-specific config variant,
[`medplum.config.hosted.example.json`](../../infra/medplum/medplum.config.hosted.example.json) - a
committed **example with `__PLACEHOLDER__` tokens**. The deploy script substitutes the `api.`/`app.`
hosts and generated super-admin credentials and ships the result as `medplum.config.json` (the real
file holds a secret and is gitignored). It differs from the local config in three ways: public HTTPS
URLs on the `api.`/`app.` origins (with `allowedOrigins` CORS-allowing both the `app.` and `forms.`
origins); `registerEnabled: false` (no public sign-up); and a generated `defaultSuperAdmin*` so the
default `admin@example.com` / `medplum_admin` pair **never exists** (that config only seeds a super
admin on an empty database).

### Provisioning under disabled registration

Because `registerEnabled: false` rejects the open-registration flow `provision-local` uses, the
hosted project is bootstrapped through the generated **super admin** instead
([`scripts/provision-hosted.ts`](../../scripts/provision-hosted.ts)): super-admin login ->
find-or-create the demo `Project` -> invite the demo coordinator as a project admin with a known
password (`sendEmail: false`, headless; `upsert: true`, idempotent) -> mint a `ClientApplication`.
It writes the same `.env` (client credentials) + `.dev-user.json` (coordinator login) the local flow
produces, so [`medplum:seed`](#local-medplum-test-project) and
[`medplum:deploy-bots`](#medplum-bots) then run **unchanged** (Bots stay `vmcontext`, ADR-0012). It
is idempotent: a surviving project (its `.env` creds still authenticate) is reused; only a wiped
server re-provisions.

### Deploy, reset + smoke scripts

Three scripts share one vocabulary
([`scripts/hosted-runtime.ts`](../../scripts/hosted-runtime.ts): the hosts, the secrets, bundle
builds, and the IAP file-shipping helpers). Everything in it is **env-first** - the pipeline supplies
hosts and secrets from repo variables/secrets, a developer's machine falls back to
`terraform -chdir=infra/gcp output` and the gitignored `infra/gcp/.deploy-secrets.json` (generated
once and reused, so the super-admin password stays consistent with what the server seeded on first
boot).

`npm run deploy:hosted` ([`scripts/deploy-hosted.ts`](../../scripts/deploy-hosted.ts)) is the whole
runtime as one idempotent script - the payload the deploy workflow runs:

1. resolve the `sslip.io` hosts and load the hosted secrets;
2. render the hardened config; build the coordinator bundle with hosted `VITE_*` values;
3. ship compose + overlay + Caddyfile + config + bundle to the VM **over IAP** and bring the stack
   up;
4. wait for Medplum health over public HTTPS (proves Let's Encrypt issued);
5. **reset + re-seed** the demo project (below);
6. run the smoke check.

`npm run reset:hosted` ([`scripts/reset-hosted.ts`](../../scripts/reset-hosted.ts)) is step 5 on its
own - the deploy's second half, and the `reset-demo` workflow's whole payload. Demo data is
**ephemeral by design** (ADR-0012), and a reset is a **project expunge** rather than a selective
delete: the super admin hard-deletes the demo `Project` compartment
(`POST fhir/R4/Project/<id>/$expunge?everything=true`, polled until the project is really gone), then
provisioning rebuilds it - fresh project, coordinator invite, client credentials - followed by
`medplum:seed` and `medplum:deploy-bots`. Because the project is recreated, the Access-link Bot gets
a **new `ProjectMembership`**, so the `/webhook/<membership-id>` path changes; the patient bundle
embeds that path at build time, so the reset rebuilds and re-ships it (the coordinator bundle is
host-only and untouched). It ends by asserting the baseline - the seeded `Questionnaire` is present
and there are zero `Patient`, `QuestionnaireResponse` and `Task` resources - so a missed expunge
fails the run instead of shipping a non-deterministic demo.

`npm run smoke:hosted` ([`scripts/smoke-hosted.ts`](../../scripts/smoke-hosted.ts)) is the
deployment's behavioural seam - the gate at the end of both the deploy and the reset. Lightweight,
**HTTP-level only** (no browser): over public HTTPS it asserts Medplum health on `api.`; `app.` and
`forms.` serve their bundles (200 + `<title>` marker); the seeded PHQ-9 `Questionnaire` is queryable
(client-credentials read); and an Access-link `open` round-trips through `forms./webhook/*` (a bogus
token yields the Bot's own `{ status: "not-found" }`, proving the same-origin proxy reaches the Bot).
It exits non-zero on any failure. Deploys are reached only over IAP - there is no public SSH.

# PROM Intake

Standardized patient self-reports (PROMs), scored into clinical signals and surfaced on a
prioritized Worklist for Care Coordinators. Built on **Medplum/FHIR**. See
[`docs/product/`](docs/product/) for the WHAT/WHY and [`docs/architecture/`](docs/architecture/) for
the HOW; start with [`docs/workflows/OPERATING_MANUAL.md`](docs/workflows/OPERATING_MANUAL.md).

## Prerequisites

- Node.js >= 20 (repo developed on 22/24)
- Docker (for the local Medplum used by integration tests)

## Setup

```bash
npm ci
```

## Everyday commands

| Command | What it does |
| ------- | ------------ |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run lint:boundaries` | dependency-cruiser deep-module boundaries |
| `npm run format` / `format:check` | Prettier (code files) |
| `npm run test:unit` | unit tests (pure, off-server) |
| `npm run test:integration` | integration tests (real Medplum) |
| `npm test` | both suites |
| `npm run check` | typecheck + lint + boundaries + tests |

## Run the whole app locally

One command brings up the **complete** local environment for the end-to-end workflow -
assign -> complete -> score -> flag -> worklist -> resolve - with everything in a single Medplum
project (so the coordinator login sees the seeded PHQ-9 and the Flags the Scoring Bot raises):

```bash
npm ci
npm run dev:full            # reuse a live project if there is one
npm run dev:full -- --fresh # force a brand-new project
```

`dev:full` starts the Docker Medplum stack, provisions (or reuses) a unified local project with
**both** a coordinator login and client credentials, seeds the PHQ-9, deploys both Bots + the
Subscription, then runs the coordinator (http://localhost:3000) and patient (http://localhost:3001)
dev servers. It prints the coordinator sign-in credentials (also written to `.dev-user.json`). Then:

1. Sign in to the coordinator, open **Assign**, create a patient, **Assign PHQ-9**, copy the Access link.
2. Open the link (patient app), answer the PHQ-9, submit.
3. Back in the coordinator **Worklist**, the Flag appears; open it to claim and resolve.

Stop the apps with Ctrl-C (Medplum keeps running). Tear everything down with:

```bash
docker compose -f infra/medplum/docker-compose.yml down -v
```

Requires Docker running and a browser to drive the UI. See
[`docs/architecture/infrastructure.md`](docs/architecture/infrastructure.md) for how the single-project
provisioning works.

## Integration tests (real Medplum)

Integration points run against a **real Medplum test project**, never a mock
([ADR-0008](docs/adr/0008-integration-tests-against-real-medplum.md)):

```bash
docker compose -f infra/medplum/docker-compose.yml up -d --wait
npm run medplum:provision        # registers a project, writes .env
npm run test:integration
docker compose -f infra/medplum/docker-compose.yml down -v
```

Without credentials the integration suite skips loudly (so `npm test` still passes on a box with no
Medplum). Full details: [`docs/architecture/infrastructure.md`](docs/architecture/infrastructure.md).

## Project layout

- `src/packages/<name>/` - deep modules (import only via entry points; see
  [`src/packages/README.md`](src/packages/README.md)).
- `scripts/` - operational scripts (e.g. Medplum provisioning).
- `infra/medplum/` - local Medplum compose stack.
- `docs/` - product, architecture, ADRs, specs, workflows.

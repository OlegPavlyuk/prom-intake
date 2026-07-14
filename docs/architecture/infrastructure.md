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

## Cloud resources

_TBD - no cloud footprint yet; the local/CI Medplum is containerised. Filled when a hosted Medplum
and app hosting are chosen._

## Infrastructure as Code

_TBD - `infra/medplum/` holds the compose definition today; broader IaC (Terraform/CDK) is deferred
until there is a cloud deploy target._

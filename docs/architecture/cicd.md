# CI / CD

**Status:** Accepted (v1) - established at the first-code milestone (T1, issue #13). Workflow:
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Continuous Integration

Every push to `main` and every pull request runs [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
split into two jobs so fast feedback never waits on Medplum:

| Job | Steps | Needs Medplum |
| --- | ----- | ------------- |
| **checks** | `typecheck` -> `lint` -> `lint:boundaries` -> `format:check` -> `test:unit` | no |
| **integration** | bring up Medplum (docker compose) -> `medplum:provision` -> `test:integration` -> tear down | yes |

The **boundary lint** (`lint:boundaries`, dependency-cruiser) enforces the deep-module rules from
[`module-boundaries.md`](module-boundaries.md). All steps must pass before merge.

### Real Medplum in CI (ADR-0008)

Integration tests never mock the FHIR server ([ADR-0008](../adr/0008-integration-tests-against-real-medplum.md)).
The `integration` job stands up a throwaway Medplum test project with
[`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) (`up -d --wait` blocks on
the healthchecks), then `npm run medplum:provision` registers a fresh project and mints
client-credentials into `.env`. Because CI provisions its own ephemeral project, **no Medplum secret
is stored in the repo or in Actions** - nothing to leak. Provisioning + seeding is described in
[`infrastructure.md`](infrastructure.md).

To run integration tests against a **hosted** Medplum test project instead, supply
`MEDPLUM_BASE_URL` / `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET` as Actions secrets and skip the
compose/provision steps (see `.env.example`).

## Pre-commit

Local fast feedback via Husky + lint-staged ([`.husky/pre-commit`](../../.husky/pre-commit)):
`lint-staged` (Prettier on staged code files) -> `typecheck` -> `lint:boundaries` -> `test:unit`.
Pre-commit deliberately runs **unit tests only** so committing never requires a running Medplum;
integration tests run in CI.

## Continuous Delivery / Deployment

_TBD - no deploy target yet. Filled when the coordinator/patient apps and Bots gain a deploy path._

## Branch protection

`main` is protected: a PR with the **checks** and **integration** jobs green is required before
merge (see [`docs/workflows/OPERATING_MANUAL.md`](../workflows/OPERATING_MANUAL.md) §9).

# CI / CD

**Status:** Accepted (v1) - established at the first-code milestone (T1, issue #13). Workflow:
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Continuous Integration

Every push to `main` and every pull request runs [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
split into two jobs so fast feedback never waits on Medplum:

| Job | Steps | Needs Medplum |
| --- | ----- | ------------- |
| **checks** | `typecheck` -> `lint` -> `lint:boundaries` -> `format:check` -> `test:unit` -> `terraform fmt -check` + `validate` (`infra/gcp/`) | no |
| **integration** | bring up Medplum (docker compose) -> `medplum:provision` -> `test:integration` -> tear down | yes |

The **boundary lint** (`lint:boundaries`, dependency-cruiser) enforces the deep-module rules from
[`module-boundaries.md`](module-boundaries.md). The **Terraform** step runs `fmt -check` and
`validate` against [`infra/gcp/`](../../infra/gcp/) with **no cloud credentials** (schema validation
only, `init -backend=false`) - it never touches GCP. All steps must pass before merge.

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

**Status:** Accepted (v1) - established in T17 (issue #59), per
[ADR-0012](../adr/0012-gcp-public-demo-deployment.md). Two workflows deliver the public GCP demo:

| Workflow | Trigger | What it runs |
| -------- | ------- | ------------ |
| [`deploy.yml`](../../.github/workflows/deploy.yml) | `workflow_run` on a **successful CI run for `main`**, plus `workflow_dispatch` | `npm run deploy:hosted` - build both bundles, ship them + compose/Caddy/Medplum config to the VM over IAP, bring the stack up, **reset + re-seed** the demo project, deploy the Bots, then the smoke gate |
| [`reset-demo.yml`](../../.github/workflows/reset-demo.yml) | `workflow_dispatch` **only** | `npm run reset:hosted` - the reset + re-seed half alone, the on-demand recovery lever |

Both workflows are thin: the payload is the same script a developer runs by hand
([`infrastructure.md`](infrastructure.md#deploy-reset--smoke-scripts)), so an automated deploy and a
manual one cannot drift apart.

### Deploying only after CI is green

`deploy.yml` listens for `workflow_run` on the **CI** workflow rather than for `push`, and its job
carries `if: github.event.workflow_run.conclusion == 'success'` - a red CI produces a `workflow_run`
event that the job then refuses. Because a `workflow_run` job checks out the default branch by
default, the checkout is pinned to `github.event.workflow_run.head_sha`: the deployed commit is
exactly the commit CI passed. Both workflows share the `hosted-demo` **concurrency group** with
`cancel-in-progress: false`, so two runs can never mutate the VM at once and a run in flight is
never killed part-way through.

### Keyless cloud auth (no stored credential)

The shared composite action
[`.github/actions/hosted-demo-target`](../../.github/actions/hosted-demo-target/action.yml) is the
only place either workflow touches GCP identity. It exchanges the run's **GitHub OIDC token** for a
short-lived access token through Workload Identity Federation (`google-github-actions/auth`,
`permissions: id-token: write`) against the provider and service account Terraform created
([`infra/gcp/iam.tf`](../../infra/gcp/iam.tf)) - whose `attribute_condition` admits only this repo on
`refs/heads/main`. **No service-account key exists anywhere**, extending ADR-0008's "CI stores no
secrets" stance to the cloud. The action then resolves the demo's three `sslip.io` hosts from the
VM's reserved IP and exports them to the job environment, so no hostname is duplicated into GitHub
configuration.

Configuration is three non-sensitive **repository variables** - `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`,
`GCP_DEPLOY_SERVICE_ACCOUNT` (set from `terraform output`; see
[`infra/gcp/README.md`](../../infra/gcp/README.md#wiring-the-cd-pipeline-to-this-substrate)) - and
four **Actions secrets**, all of them Medplum logins:

| Secret | Used for |
| ------ | -------- |
| `MEDPLUM_SUPER_ADMIN_EMAIL` / `MEDPLUM_SUPER_ADMIN_PASSWORD` | Bootstrapping and expunging the demo project (registration is disabled on the hosted server) |
| `DEMO_COORDINATOR_EMAIL` / `DEMO_COORDINATOR_PASSWORD` | The demo coordinator login the deploy invites - a **plain project member**, published in the README so the demo is self-serve |

Actions masks them in logs, and the deploy script prints only the coordinator **email**, never a
password. The two credential sets are deliberately different in kind: the super-admin pair is
generated, strong, and secret (it can administer the server), while the coordinator pair is
human-readable and public (it can only do a Care Coordinator's job). Changing
`DEMO_COORDINATOR_PASSWORD` takes effect on the next deploy or `reset-demo` run, because the reset
re-invites the coordinator from the secret - so the README and the live login are kept in step by
re-running the pipeline, not by hand.

### Reset on every deploy

Demo data is ephemeral by design (ADR-0012): each deploy expunges the whole demo `Project`
compartment as super admin and rebuilds it, so every release starts from the same seeded baseline -
PHQ-9 plus the synthetic patients a visitor assigns to. The reset asserts that itself - it fails
unless the fresh project holds exactly the synthetic `Patient`s and no `QuestionnaireResponse` or
`Task` - and the deploy then runs the smoke gate. There are **no
scheduled jobs**; the only unattended trigger in the repo is "CI went green on `main`".

### The smoke gate

Every run ends with `npm run smoke:hosted` over public HTTPS (Medplum health, both bundles served,
seeded PHQ-9 queryable, `/webhook` round-trip). It exits non-zero on the first failure, which fails
the step and the run - a deploy that does not serve a working demo cannot report success.

## Branch protection

`main` is protected: a PR with the **checks** and **integration** jobs green is required before
merge (see [`docs/workflows/OPERATING_MANUAL.md`](../workflows/OPERATING_MANUAL.md) §9).

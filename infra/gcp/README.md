# GCP demo substrate (Terraform)

Infrastructure-as-code for the public portfolio demo defined in
[ADR-0012](../../docs/adr/0012-gcp-public-demo-deployment.md) and spec #55. This module provisions
the **substrate only** - the VM, network, identity, and cost guardrail. The application runtime
(Caddy + compose stack) is [`docs/architecture/infrastructure.md`](../../docs/architecture/infrastructure.md#hosted-runtime);
the CD pipeline that consumes the identity below is
[`docs/architecture/cicd.md`](../../docs/architecture/cicd.md#continuous-delivery--deployment).

Everything lives inside the pre-existing, manually-created project `prom-intake-demo`. Terraform
never creates or bills the project - only resources inside it.

## What it creates

| Area | Resources |
| --- | --- |
| Network | Custom VPC + subnet, reserved static external IP, firewall (80/443 from anywhere; SSH 22 **only** from the IAP range) |
| Compute | One `e2-medium` Debian 12 VM, Docker + Compose installed via startup script, OS Login on, dedicated least-privilege runtime SA |
| Identity | Deploy service account, Workload Identity Federation pool + provider trusted for `OlegPavlyuk/prom-intake`, keyless (no SA keys) |
| Cost | Billing budget on the demo project with 50/90/100% alert thresholds |

## Prerequisites

- `terraform` >= 1.5 and the `gcloud` CLI.
- Application-default credentials for an identity with Owner (or equivalent) on `prom-intake-demo`
  **and** a budget role (e.g. Billing Account Administrator) on the billing account:

  ```bash
  gcloud auth application-default login
  ```

- Never rely on the gcloud default project; this config sets the project explicitly.

## First-time apply

```bash
# 1. One-time: create the versioned GCS bucket that stores remote state.
#    Its own state is local + gitignored; it only tracks the bucket.
cd infra/gcp/bootstrap
terraform init
terraform apply          # creates gs://prom-intake-demo-tfstate

# 2. Provision the substrate (state now lives in that bucket).
cd ..
terraform init           # backend = the bucket from step 1
terraform apply
```

`terraform apply` is idempotent: a second apply immediately after the first plans **zero changes**.

## Outputs

```bash
terraform output
```

- `vm_static_ip` - reserved external IP.
- `coordinator_host` / `patient_host` / `api_host` - the three `sslip.io` hostnames.
- `vm_name` / `vm_zone` - the deploy target's coordinates.
- `wif_provider_name` - full WIF provider resource name (fed to `google-github-actions/auth`).
- `deploy_service_account_email` - the SA that GitHub Actions impersonates.

## Wiring the CD pipeline to this substrate

Three **repository variables** (not secrets - none of these is sensitive) point the
[deploy](../../.github/workflows/deploy.yml) and [reset](../../.github/workflows/reset-demo.yml)
workflows at this substrate. Set them once, after the first apply:

```bash
gh variable set GCP_PROJECT_ID             --body prom-intake-demo   # = var.project_id
gh variable set GCP_WIF_PROVIDER           --body "$(terraform -chdir=infra/gcp output -raw wif_provider_name)"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --body "$(terraform -chdir=infra/gcp output -raw deploy_service_account_email)"
```

Everything else the pipeline discovers at run time: the composite action
[`.github/actions/hosted-demo-target`](../../.github/actions/hosted-demo-target/action.yml) reads the
VM's reserved IP and derives the three `sslip.io` hosts from it, so no hostname is duplicated into
GitHub configuration.

**There is deliberately no cloud-credential secret.** The only Actions secrets are Medplum logins:
`MEDPLUM_SUPER_ADMIN_*` (required) and `DEMO_COORDINATOR_*` (optional - it overrides the coordinator
login that is published in the README and lives in `scripts/hosted-demo.ts`); see
[`cicd.md`](../../docs/architecture/cicd.md#continuous-delivery--deployment). Creating a
service-account key would violate [ADR-0012](../../docs/adr/0012-gcp-public-demo-deployment.md).

## Teardown

At the end of the credit window (T19):

```bash
cd infra/gcp
terraform destroy        # removes everything EXCEPT the state bucket
```

The state bucket is created by the bootstrap module and carries `prevent_destroy`, so it survives.
Delete it manually only when you are done with the state history:

```bash
gcloud storage rm --recursive gs://prom-intake-demo-tfstate --project prom-intake-demo
```

## Notes

- **No secrets in this directory.** `*.tfvars` (except `*.tfvars.example`), state files, and the
  `.terraform/` plugin cache are gitignored. The only credentials in the whole demo are the Medplum
  admin/demo logins, which live in GitHub Actions secrets - never here.
- **SSH is IAP-only.** There is no public port 22. Reach the VM with
  `gcloud compute ssh prom-intake-demo --zone europe-west1-b --tunnel-through-iap`.
- **CI** runs `terraform fmt -check` + `terraform validate` on this directory (no cloud creds; it
  validates only). See [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

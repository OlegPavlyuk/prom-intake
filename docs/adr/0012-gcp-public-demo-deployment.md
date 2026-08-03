---
status: accepted
date: 2026-08-03
---

# Public demo deployment: one GCE VM, sslip.io HTTPS, keyless CD, reset-on-deploy

The public portfolio demo runs on a **single Google Compute Engine VM** hosting the existing
[`infra/medplum/docker-compose.yml`](../../infra/medplum/docker-compose.yml) stack behind a
**Caddy** reverse proxy that also serves both built SPA bundles. DNS and TLS come from
**sslip.io wildcard DNS + automatic Let's Encrypt certificates**; infrastructure is provisioned by
**Terraform** (`infra/gcp/`); deployment runs in **GitHub Actions authenticated via Workload
Identity Federation** (no stored cloud credentials); and **every deployment resets and re-seeds the
demo project**, with a manually triggerable reset workflow as the recovery path. The deployment is
**time-boxed** (~10 days of free credits) with teardown (`terraform destroy` + README flip to
captured evidence) designed in from the start. Implementation is spec #55.

## Context

- The portfolio goal ([`docs/project/portfolio-goals.md`](../project/portfolio-goals.md)) requires
  the end-to-end flow to be demoable in a deployed environment; until now every deploy-related
  section of [`infrastructure.md`](../architecture/infrastructure.md) and
  [`cicd.md`](../architecture/cicd.md) was _TBD_.
- Constraints: free GCP credits usable for ~10 days (no AWS budget), no custom domain, and a
  self-serve audience (recruiters/engineers must be able to click through unaided).
- The application's shape drives the topology: two static Vite bundles
  ([ADR-0010](0010-frontend-architecture.md)), a self-hosted Medplum (Postgres + Redis + server)
  already proven as a compose stack in CI ([ADR-0008](0008-integration-tests-against-real-medplum.md)),
  and two `vmcontext` Bots. The patient app **must** reach `/webhook` same-origin because Medplum
  sends no CORS headers on it ([ADR-0005](0005-access-link-security-model.md);
  [`infrastructure.md`](../architecture/infrastructure.md)).

## Decision and why

- **One VM running the existing compose stack.** It deploys exactly what CI already exercises -
  no second runtime to debug inside a 10-day window - and a single front door solves the
  `/webhook` same-origin constraint by construction.
- **Caddy as the only public-facing component.** Static file serving for both bundles, reverse
  proxy to Medplum, and automatic Let's Encrypt issuance in one piece of config.
- **Three sslip.io hosts** (`app.`, `forms.`, `api.` on `<ip>.sslip.io`) keep the coordinator and
  patient apps **origin-isolated**, preserving ADR-0010's credential isolation in production
  shape. sslip.io needs no signup and no DNS management; ugly URLs are acceptable because the
  durable public face is the README evidence, not the raw URL.
- **Terraform with GCS-backed state.** The infra is code in the repo (VM, static IP, firewall,
  service account, WIF, billing alert), teardown is one command, and the IaC remains as evidence
  after the credits expire.
- **Workload Identity Federation for CD.** GitHub's OIDC token is exchanged at run time; no
  long-lived cloud key exists anywhere - extending the repo's existing "CI stores no secrets"
  stance (ADR-0008) to the cloud. Only Medplum admin/demo credentials live in Actions secrets.
- **Bots stay on `vmcontext`.** The hosted server is our own single-tenant instance - the same
  trust model as local/CI, where the sandbox caveat is already accepted (the code is ours; the
  `AccessPolicy` envelope, not the sandbox, is the security boundary).
- **Demo access model: published credentials, synthetic data, reset-on-deploy.** Registration is
  disabled, the super-admin secret is strong and generated, a demo coordinator login is published
  in the README, both apps carry a "synthetic data only" banner, and every deployment wipes and
  re-seeds the demo project so each release starts deterministic. A `workflow_dispatch` reset
  workflow is the recovery path. No scheduled jobs.

## Considered and rejected

- **Cloud-native split (Cloud Run + Cloud SQL + Memorystore + Firebase Hosting).** 3-5x the
  build-out for a 10-day demo; managed Postgres/Redis burn the credit budget; Medplum server is
  not a first-class Cloud Run citizen; and Firebase Hosting cannot reverse-proxy `/webhook` to an
  arbitrary origin, breaking the one hard topological constraint.
- **AWS.** No credits/budget available; GCP credits exist. The Terraform + keyless-CD pattern is
  provider-portable, and that pattern - not the provider - is the durable demonstration.
- **Scheduled daily reset.** Rejected for reset-on-deploy + manual dispatch: deterministic after
  every release, no idle scheduled jobs, and an on-demand recovery lever.
- **Service-account JSON key in Actions secrets.** A long-lived credential GCP's own guidance
  deprecates; WIF costs ~40 lines of Terraform once.
- **DuckDNS / purchased domain.** Signup or cost for marginal URL cosmetics; Caddy makes a later
  domain swap a config-only change if ever wanted.

## Consequences

- **Demo data is ephemeral by design** - every merge to `main` resets it. Correct for this demo;
  wrong for anything real. This ADR is scoped to the public portfolio demo environment only and
  sets no precedent for a production deployment topology.
- **Hostnames are coupled to the static IP** (sslip.io encodes it). The IP is reserved in
  Terraform; if it ever changes, URLs change with it - acceptable for a time-boxed demo.
- **No HA** - one VM, restart-on-failure only. Accepted for the window.
- **Let's Encrypt rate limits on the shared sslip.io suffix are a known risk**; the fallback
  (DuckDNS or a cheap domain) is a Caddy config change, not an architecture change.
- **End-of-life is part of the design:** `terraform destroy`, then the README flips from live
  links to captured screenshots/video. The repo permanently retains the Terraform, the workflows,
  and the evidence. **Revisit if** the demo is revived on a paid account - a custom domain and a
  hosted/managed Medplum then clear the bar for reconsideration.

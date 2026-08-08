# Keyless CD identity. GitHub Actions impersonates this service account through
# Workload Identity Federation - no service-account key exists anywhere
# (ADR-0012). Its only job is to reach the VM for deploys.
resource "google_service_account" "deploy" {
  account_id   = "gh-deploy"
  display_name = "GitHub Actions deploy (WIF, keyless)"
  depends_on   = [time_sleep.wait_for_apis]
}

# Least privilege for an IAP-tunnelled OS Login deploy:
#  - osAdminLogin: SSH in with sudo (to write files and run docker compose), and
#    the instances.get/projects.get reads gcloud needs to resolve the VM.
#  - iap.tunnelResourceAccessor: open the IAP TCP tunnel, scoped to this one VM.
# No project-wide compute admin, no ability to touch Flags/Patients/etc.
resource "google_project_iam_member" "deploy_os_admin_login" {
  project = var.project_id
  role    = "roles/compute.osAdminLogin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_iap_tunnel_instance_iam_member" "deploy_tunnel" {
  project  = var.project_id
  zone     = local.zone
  instance = google_compute_instance.vm.name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

# Workload Identity Federation: trust GitHub's OIDC issuer, but only for tokens
# minted by this repo (attribute_condition), and only let those tokens
# impersonate the deploy SA (the principalSet binding below).
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Keyless CD identity federation for ${var.github_repo}"
  depends_on                = [time_sleep.wait_for_apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Reject any token that is not from our repo AND the deploy branch before it
  # can be exchanged. Scoping the sudo-capable deploy identity to one branch
  # matters especially for a public repo, where anyone can open a PR.
  attribute_condition = "assertion.repository == \"${var.github_repo}\" && assertion.ref == \"refs/heads/${var.github_deploy_branch}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Only workflows running in var.github_repo may act as the deploy SA.
resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# `gcloud compute ssh` against an instance that runs AS a service account also
# needs actAs on that service account - without it the IAP session is refused
# before the tunnel is even attempted. Scoped to the VM's own runtime SA rather
# than granted project-wide, so the deploy identity can act as this one instance
# and nothing else. A human running the deploy by hand never needed this (Owner
# implies actAs), which is why it only surfaced on the first unattended run (#66).
resource "google_service_account_iam_member" "deploy_act_as_vm" {
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

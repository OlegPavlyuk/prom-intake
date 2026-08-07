output "vm_static_ip" {
  description = "Reserved external IP of the demo VM."
  value       = google_compute_address.static.address
}

# The three origin-isolated hosts (ADR-0010 credential isolation), derived from
# the static IP via sslip.io wildcard DNS. Consumed by Caddy config (T16).
output "coordinator_host" {
  description = "Coordinator app hostname."
  value       = "app.${google_compute_address.static.address}.sslip.io"
}

output "patient_host" {
  description = "Patient completion page hostname."
  value       = "forms.${google_compute_address.static.address}.sslip.io"
}

output "api_host" {
  description = "Medplum API hostname."
  value       = "api.${google_compute_address.static.address}.sslip.io"
}

output "vm_name" {
  description = "Demo VM instance name (deploy target)."
  value       = google_compute_instance.vm.name
}

output "vm_zone" {
  description = "Zone the demo VM runs in."
  value       = google_compute_instance.vm.zone
}

# Consumed by the CD pipeline (T17) to configure keyless auth.
output "wif_provider_name" {
  description = "Full resource name of the WIF provider (google-github-actions/auth workload_identity_provider)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account_email" {
  description = "Service account GitHub Actions impersonates via WIF."
  value       = google_service_account.deploy.email
}

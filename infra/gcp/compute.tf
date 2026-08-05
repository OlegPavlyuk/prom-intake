# Dedicated least-privilege runtime identity for the VM instead of the broad
# default compute service account. It only needs to ship its own logs/metrics;
# the application talks to its own Medplum, not to GCP APIs.
resource "google_service_account" "vm" {
  account_id   = "prom-intake-vm"
  display_name = "PROM Intake demo VM runtime"
  depends_on   = [time_sleep.wait_for_apis]
}

resource "google_project_iam_member" "vm_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_project_iam_member" "vm_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.vm.email}"
}

# The single demo host. One e2-medium runs the existing compose stack behind
# Caddy (ADR-0012). Tags wire it to the two firewall rules; OS Login is on so
# the deploy SA authenticates over IAP without managing instance SSH keys.
resource "google_compute_instance" "vm" {
  name         = "prom-intake-demo"
  machine_type = var.machine_type
  zone         = local.zone
  tags         = ["web", "iap-ssh"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = var.boot_disk_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id

    # Bind the reserved static IP so the sslip.io hostnames stay valid.
    access_config {
      nat_ip = google_compute_address.static.address
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
    startup-script = file("${path.module}/startup-script.sh")
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }

  # Let Terraform stop the VM to apply machine-type/disk changes in place.
  allow_stopping_for_update = true

  labels = {
    environment = "demo"
  }
}

# A dedicated VPC (rather than the auto-created default network) so the whole
# footprint is code and default-deny on ingress: only the two firewall rules
# below open anything. SSH (22) is deliberately absent from any public rule.
resource "google_compute_network" "vpc" {
  name                    = "prom-intake-demo-vpc"
  auto_create_subnetworks = false

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "prom-intake-demo-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# Reserved so the sslip.io hostnames (which encode the IP) stay stable for the
# life of the demo. Output for the CD pipeline and the README.
resource "google_compute_address" "static" {
  name       = "prom-intake-demo-ip"
  region     = var.region
  depends_on = [time_sleep.wait_for_apis]
}

# The public front door: Caddy (T16) terminates 80/443 for all three sslip.io
# hosts. Nothing else is reachable from the internet.
resource "google_compute_firewall" "allow_web" {
  name      = "prom-intake-demo-allow-web"
  network   = google_compute_network.vpc.name
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web"]
}

# SSH is reachable ONLY through Identity-Aware Proxy: this rule admits port 22
# solely from IAP's published range. There is no 0.0.0.0/0 rule for 22, so the
# VM has no publicly reachable SSH port - deploys tunnel through IAP (T17).
resource "google_compute_firewall" "allow_iap_ssh" {
  name      = "prom-intake-demo-allow-iap-ssh"
  network   = google_compute_network.vpc.name
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's fixed source range for TCP forwarding.
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["iap-ssh"]
}

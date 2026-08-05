# One-time bootstrap: create the versioned GCS bucket that holds the *main*
# config's remote state. This config keeps its own state LOCAL (there is no
# bucket yet to store it in) - that local state only ever tracks this one bucket
# and is gitignored. Run once before `terraform init` in the parent directory.
# See infra/gcp/README.md.
terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_storage_bucket" "tf_state" {
  # Fixed name referenced verbatim by ../backend.tf.
  name     = "${var.project_id}-tfstate"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  # Keep state history bounded; expire very old object versions.
  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  # The state bucket must survive `terraform destroy` of the substrate.
  lifecycle {
    prevent_destroy = true
  }
}

output "state_bucket" {
  description = "GCS bucket backing the main config's remote state."
  value       = google_storage_bucket.tf_state.name
}

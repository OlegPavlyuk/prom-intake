# Terraform + provider version constraints for the demo substrate.
# Pinned so `apply` is reproducible across machines and across the ~10-day
# credit window (ADR-0012). The lock file (.terraform.lock.hcl) pins exact
# provider hashes for linux_amd64 (CI) and the maintainer's arch.
terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }
}

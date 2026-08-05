# Remote state in the versioned GCS bucket created by infra/gcp/bootstrap.
# The bucket name is fixed (derived from the demo project id) so the backend
# needs no variables - which Terraform backends do not support anyway. Run the
# bootstrap once before the first `terraform init` here (see README.md).
terraform {
  backend "gcs" {
    bucket = "prom-intake-demo-tfstate"
    prefix = "gcp/state"
  }
}

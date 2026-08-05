# The project is created and billed manually by the maintainer; Terraform only
# manages resources *inside* it (ADR-0012). The project id is always set
# explicitly here - never inherited from the gcloud CLI default, which points at
# an unrelated stale project on the dev machine.
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = local.zone

  # Some APIs (notably billingbudgets) require a quota/billing project on the
  # request. With user ADC the provider otherwise attributes the call to the
  # CLI's default OAuth project, where the API is disabled - so send our project
  # as the user-project header instead.
  billing_project       = var.project_id
  user_project_override = true
}

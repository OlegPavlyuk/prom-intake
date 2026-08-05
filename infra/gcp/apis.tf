# Enable every API the substrate needs so `apply` from a clean project is
# self-contained. disable_on_destroy = false keeps `terraform destroy` fast and
# side-effect-free: leaving an API enabled costs nothing and never deletes data.
resource "google_project_service" "required" {
  for_each = toset([
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "iap.googleapis.com",
    "oslogin.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# A freshly-enabled API can lag before it will accept resource creation. Gate
# every dependent resource on this short settle window so a single `apply` from
# a clean project succeeds without a manual retry.
resource "time_sleep" "wait_for_apis" {
  depends_on      = [google_project_service.required]
  create_duration = "60s"
}

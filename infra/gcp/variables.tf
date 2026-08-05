variable "project_id" {
  description = "Existing GCP project that hosts the demo (Terraform never creates it)."
  type        = string
  default     = "prom-intake-demo"
}

variable "region" {
  description = "Region for regional resources (static IP, subnet)."
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = "Zone for the single demo VM. Leave empty to derive <region>-b from the region."
  type        = string
  default     = ""
}

variable "machine_type" {
  description = "VM machine type. e2-medium comfortably runs the compose stack for a demo."
  type        = string
  default     = "e2-medium"
}

variable "boot_disk_gb" {
  description = "Boot disk size in GB (holds Docker images + volumes for the demo)."
  type        = number
  default     = 30
}

variable "github_repo" {
  description = "owner/name of the GitHub repo trusted by Workload Identity Federation for keyless CD."
  type        = string
  default     = "OlegPavlyuk/prom-intake"
}

variable "github_deploy_branch" {
  description = "Branch whose GitHub Actions runs may impersonate the deploy SA via WIF. Scopes the sudo-capable deploy identity to a single branch."
  type        = string
  default     = "main"
}

variable "billing_account" {
  description = "Billing account id the budget alert is scoped to."
  type        = string
  default     = "015795-E603BB-818DAD"
}

variable "budget_amount_usd" {
  description = "Monthly budget (USD) for the cost-guardrail alert on the demo project."
  type        = number
  default     = 50
}

variable "project_id" {
  description = "Existing GCP project that hosts the demo (must match the parent config)."
  type        = string
  default     = "prom-intake-demo"
}

variable "region" {
  description = "Location for the state bucket."
  type        = string
  default     = "europe-west1"
}

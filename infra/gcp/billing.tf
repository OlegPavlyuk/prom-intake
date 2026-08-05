# Cost guardrail for the credit window. A budget on the demo project emails the
# billing admins at 50/90/100% of the configured amount - enough to catch a
# runaway before the free credits are gone (ADR-0012). Requires the applying
# identity to have a budget role on the billing account.
data "google_project" "demo" {
  project_id = var.project_id
}

resource "google_billing_budget" "demo" {
  billing_account = var.billing_account
  display_name    = "prom-intake-demo budget"

  budget_filter {
    projects = ["projects/${data.google_project.demo.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_amount_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  depends_on = [time_sleep.wait_for_apis]
}

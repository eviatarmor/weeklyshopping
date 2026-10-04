locals {
  hostname    = "${var.worker_name}.${var.workers_subdomain}.workers.dev"
  team_domain = "${var.team_name}.cloudflareaccess.com"
  emails      = [for m in var.household_members : lower(m.email)]
}

resource "cloudflare_zero_trust_access_identity_provider" "google" {
  account_id = var.account_id
  name       = "Google"
  type       = "google"
  config = {
    client_id     = var.google_client_id
    client_secret = var.google_client_secret
  }
}

resource "cloudflare_zero_trust_access_application" "app" {
  account_id                 = var.account_id
  name                       = "Weekly Shopping"
  type                       = "self_hosted"
  domain                     = local.hostname
  session_duration           = var.session_duration
  allowed_idps               = [cloudflare_zero_trust_access_identity_provider.google.id]
  auto_redirect_to_identity  = true
  app_launcher_visible       = false
  http_only_cookie_attribute = true
  same_site_cookie_attribute = "lax"

  # Only these exact Google accounts get past Access; everyone else is denied.
  policies = [
    {
      name       = "Household members"
      decision   = "allow"
      precedence = 1
      include    = [for email in local.emails : { email = { email = email } }]
    }
  ]
}

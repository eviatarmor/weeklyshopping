output "app_url" {
  value = "https://${local.hostname}"
}

output "access_team_domain" {
  value = local.team_domain
}

output "access_aud" {
  value = cloudflare_zero_trust_access_application.app.aud
}

output "google_redirect_uri" {
  description = "Paste into the Google OAuth client's Authorized redirect URIs."
  value       = "https://${local.team_domain}/cdn-cgi/access/callback"
}

# Fed to the Worker as the HOUSEHOLD_MEMBERS secret (see scripts/sync-github.sh).
output "household_members_json" {
  value     = jsonencode([for m in var.household_members : { email = lower(m.email), name = m.name }])
  sensitive = true
}

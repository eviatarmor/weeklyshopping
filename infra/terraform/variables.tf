variable "cloudflare_api_token" {
  description = "API token with Access: Apps and Policies Edit, Access: Organizations, Identity Providers, and Groups Edit."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account ID (dashboard → Workers & Pages → right sidebar)."
  type        = string
}

variable "team_name" {
  description = "Zero Trust team name chosen when enabling Zero Trust; the login domain is <team_name>.cloudflareaccess.com."
  type        = string
}

variable "workers_subdomain" {
  description = "Your workers.dev subdomain, e.g. \"eviatar\" for weeklyshopping.eviatar.workers.dev."
  type        = string
}

variable "worker_name" {
  description = "Worker name from wrangler.jsonc."
  type        = string
  default     = "weeklyshopping"
}

variable "google_client_id" {
  description = "OAuth client ID from Google Cloud Console."
  type        = string
}

variable "google_client_secret" {
  description = "OAuth client secret from Google Cloud Console."
  type        = string
  sensitive   = true
}

variable "session_duration" {
  description = "How long a login lasts before Access asks again (max one month)."
  type        = string
  default     = "730h"
}

variable "household_members" {
  description = "The only Google accounts allowed in. Keep these in terraform.tfvars (gitignored), never in the repo."
  type = list(object({
    email = string
    name  = string
  }))
  sensitive = true

  validation {
    condition     = length(var.household_members) > 0
    error_message = "Add at least one household member."
  }
}

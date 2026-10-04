#!/usr/bin/env bash
# Copies deploy settings into the GitHub repo so CI can deploy.
# Run from the repo root after `terraform apply`. Needs the GitHub CLI (`gh auth login`).
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/sync-github.sh
set -euo pipefail

TF="terraform -chdir=infra/terraform"

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (token with Workers Scripts: Edit)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"

# Secrets: encrypted, never shown in logs or the UI.
printf '%s' "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN
printf '%s' "$CLOUDFLARE_ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID
$TF output -raw household_members_json | gh secret set HOUSEHOLD_MEMBERS

# Variables: not secret (they're visible in every Access JWT anyway).
gh variable set ACCESS_TEAM_DOMAIN --body "$($TF output -raw access_team_domain)"
gh variable set ACCESS_AUD --body "$($TF output -raw access_aud)"

echo "GitHub secrets and variables updated. Push to main (or re-run the Deploy workflow) to deploy."

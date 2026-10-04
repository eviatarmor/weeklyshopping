# Deploying

Everything runs on Cloudflare's free tier:

- **Worker + Durable Object**: the app and its SQLite database. GitHub Actions deploys it with `wrangler` on every push to `main`.
- **Cloudflare Access + Google**: the login. Managed by the Terraform in this folder, run from your machine.

Who can sign in is never stored in the repo. The emails live in `terraform.tfvars` (gitignored), in the Access policy on Cloudflare, and in the `HOUSEHOLD_MEMBERS` GitHub secret / Worker secret. The Worker double-checks every request against that secret, so even if Access were misconfigured nobody else gets in.

## One-time setup

### 1. Cloudflare account

1. Create a free Cloudflare account.
2. Open **Workers & Pages** once and pick a `workers.dev` subdomain. That's `workers_subdomain`.
3. Open **Zero Trust**, pick the **Free** plan and choose a team name. That's `team_name`; the login page will be `<team_name>.cloudflareaccess.com`. Cloudflare may ask for a card; the free plan isn't charged.
4. Copy your **Account ID** (Workers & Pages overview, right-hand side).
5. Create an **API token** (My Profile → API Tokens → Create Token → Custom token) with these **account** permissions:
   - Access: Apps and Policies → Edit
   - Access: Organizations, Identity Providers, and Groups → Edit
   - Workers Scripts → Edit
   - Account Settings → Read

   One token covers both Terraform and GitHub Actions.

### 2. Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → OAuth consent screen**: External, any app name, default scopes (email, profile, openid). Then **Publish app**. Basic scopes need no Google review, and published apps avoid the 7-day token expiry of "Testing" mode.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized JavaScript origins: `https://<team_name>.cloudflareaccess.com`
   - Authorized redirect URIs: `https://<team_name>.cloudflareaccess.com/cdn-cgi/access/callback`
4. Copy the client ID and secret.

### 3. Terraform (on your machine)

Install [Terraform](https://developer.hashicorp.com/terraform/install) and the [GitHub CLI](https://cli.github.com/) (`gh auth login`).

```sh
cd infra/terraform
# terraform.tfvars already lists the two allowed Gmail accounts; fill in the REPLACE_ME values
terraform init
terraform apply
```

This creates the Google identity provider, the Access application on `weeklyshopping.<subdomain>.workers.dev` (Google only, one-month sessions) and a policy that allows exactly the emails in `household_members`.

### 4. Hand the settings to GitHub

From the repo root:

```sh
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account id> ./scripts/sync-github.sh
```

It sets these on `eviatarmor/weeklyshopping`:

| Name | Kind | From |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | you |
| `CLOUDFLARE_ACCOUNT_ID` | secret | you |
| `HOUSEHOLD_MEMBERS` | secret | `terraform output household_members_json` |
| `ACCESS_TEAM_DOMAIN` | variable | `terraform output access_team_domain` |
| `ACCESS_AUD` | variable | `terraform output access_aud` |

(Prefer clicking? Settings → Secrets and variables → Actions, and add the same names.)

### 5. Deploy

Push to `main`, or run the **CI** workflow manually (Actions → CI → Run workflow). The deploy job runs after type checks, unit tests and the browser tests pass, and only once `ACCESS_AUD` is set.

Open `terraform output app_url` on your phone, sign in with Google, then use "Add to Home Screen".

## Changing who has access

Edit `household_members` in `terraform.tfvars`, then:

```sh
terraform -chdir=infra/terraform apply
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/sync-github.sh
```

and re-run the CI workflow so the Worker secret updates.

## Deploying by hand (optional)

```sh
pnpm build
pnpm exec wrangler deploy --var ACCESS_TEAM_DOMAIN:<team>.cloudflareaccess.com --var ACCESS_AUD:<aud>
terraform -chdir=infra/terraform output -raw household_members_json | pnpm exec wrangler secret put HOUSEHOLD_MEMBERS
```

## State

Terraform state is a local `terraform.tfstate` (gitignored). It only covers the Access app and identity provider, so if it's lost you can re-import or recreate them in minutes.

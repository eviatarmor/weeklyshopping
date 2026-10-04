# WeeklyShopping — Plan

A mobile-first web app (installable PWA) for a shared weekly shopping list and a read-only recipe book, running entirely on Cloudflare's free tier.

## Goals

1. **Shopping list**
   - Autocomplete from past items and from a known grocery catalog.
   - Items are grouped automatically into store sections (Fruit & Veg, Pantry, Dairy, ...).
   - Live sync between two people editing at the same time.
2. **Recipes** (view only in the app)
   - Mostly HelloFresh AU, plus recipes from other sites.
   - "Add to list" asks which ingredients you already have before adding the rest.
   - Seasoning blends (e.g. HelloFresh "American Spice Blend") are recipes themselves. Recipes link to them, and you can buy the blend or make it from scratch.
   - Each person can rate recipes.
3. **Images** use public image URLs only. Nothing is stored on a server or in a bucket.
4. **Login** with Google, remembered in the browser (re-login about once a month).

Non-goals: adding or editing recipes in the UI (recipes are added through the repo, see [Recipe content workflow](#recipe-content-workflow)), image hosting, backups, multiple languages (English only), and public sign-up.

## Stack

| Layer | Choice |
|---|---|
| Language / package manager | TypeScript, pnpm |
| Frontend | React 19, Vite, TanStack Router, TanStack Query |
| UI | Tailwind CSS v4 + shadcn/ui (Drawer/vaul for bottom sheets, Command/cmdk for autocomplete, Checkbox, Tabs, Sonner toasts) |
| Mobile shell | PWA via `vite-plugin-pwa`, standalone display, bottom tab bar, safe-area insets |
| API | tRPC v11 (HTTP batch link for queries and mutations, `httpSubscriptionLink` (SSE) for live updates) |
| Edge runtime | Cloudflare Workers + Hono |
| State / DB | One Cloudflare Durable Object per household with built-in SQLite, accessed through Drizzle ORM (`drizzle-orm/durable-sqlite`) |
| Realtime | tRPC subscriptions over SSE, served from the household Durable Object, using an in-memory event emitter |
| Auth | Cloudflare Access (Zero Trust free plan) with Google as the only identity provider. The Worker verifies the Access JWT with `jose`. |
| Infra as code | Terraform (`cloudflare` provider) for Access, the identity provider and policies. `wrangler` for the Worker and Durable Object deploys. |
| Local dev | `@cloudflare/vite-plugin`: a single `pnpm dev` runs the React app, the Worker and the Durable Object (Miniflare) with a local SQLite store |
| Tests | Vitest (+ `@cloudflare/vitest-pool-workers` for Durable Object tests), Playwright for end-to-end tests including two-browser realtime |
| CI/CD | GitHub Actions: typecheck, test, `terraform validate`, `wrangler deploy` on push to `main` |

### Why this shape

- **$0/month.** Every component fits the free tiers (see [Cost](#cost)), and the Workers free plan never bills overages. It returns errors instead.
- **Serverless.** No VM, no OS patching, scales to zero.
- **SQLite + Drizzle + tRPC** as originally wanted. The Durable Object gives us a single-writer SQLite database per household, which suits a shared list well because there are no race conditions between instances.
- **No domain needed.** The app is served at `weeklyshopping.<account>.workers.dev` with HTTPS, protected by Cloudflare Access.
- **SSE over WebSockets.** Writes already go through tRPC mutations, so clients only need to *receive* pushes. SSE keeps all API code inside tRPC and works through Access with the same cookie. WebSocket hibernation would save idle Durable Object time, but at one household even a 24/7 open stream stays inside the free duration quota.

## Architecture

```
Browser (PWA)
  │  HTTPS, CF_Authorization cookie (Google via Cloudflare Access)
  ▼
Cloudflare Access ── blocks anyone not on the allow-list
  │  adds Cf-Access-Jwt-Assertion header
  ▼
Worker (Hono)
  ├─ static assets (built React app)
  └─ /trpc/*  ── verify Access JWT ── email → household ── forward to Durable Object
                                                            │
                                                            ▼
                                     HouseholdDO (locationHint: "oc")
                                       ├─ SQLite (Drizzle) — list, history, recipes, ratings
                                       ├─ tRPC fetch handler (queries, mutations, SSE subscriptions)
                                       └─ event emitter → pushes changes to every open SSE stream
```

- The **Worker** is stateless. It verifies the JWT against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` with the expected audience (`ACCESS_AUD`, set at deploy time), checks the email against the `HOUSEHOLD_MEMBERS` secret, and forwards the request to `env.HOUSEHOLD.get(idFromName(householdId))`, passing the user identity in a trusted internal header.
- The **HouseholdDO** runs Drizzle migrations in its constructor (inside `blockConcurrencyWhile`), syncs the bundled content (catalog, recipes, blends) when the content hash changes, and serves tRPC.
- **Location:** the Durable Object is created with `locationHint: "oc"` so it lives in Oceania, close to AU users.

## Data model (per-household SQLite)

Recipes, blends and the catalog are **bundled content** synced from the repo. Lists, history and ratings are **user data**. User data refers to content by stable slug, so re-syncing content never breaks it.

| Table | Columns | Notes |
|---|---|---|
| `users` | `email` (pk), `display_name`, `created_at` | Created automatically on first request |
| `sections` | `id`, `name`, `emoji`, `sort_order` | Seeded with AU supermarket sections; the order can be changed to match your store layout |
| `products` | `slug` (pk), `name`, `aliases` (json), `section_id`, `image_url` | Known grocery catalog, synced from `content/catalog.json` |
| `item_history` | `normalized_name` (pk), `display_name`, `product_slug?`, `section_id`, `use_count`, `last_used_at`, `usually_have` | Learns past items, section corrections and pantry staples |
| `list_items` | `id`, `name`, `product_slug?`, `qty?`, `unit?`, `section_id`, `checked`, `note?`, `source_recipe_slug?`, `added_by`, `version`, `updated_at` | The live list |
| `recipes` | `slug` (pk), `kind` (`meal` \| `blend`), `title`, `subtitle?`, `image_url?`, `source_url?`, `servings`, `prep_minutes?`, `tags` (json), `steps` (json), `content_hash` | Synced from `content/recipes` and `content/blends` |
| `recipe_ingredients` | `recipe_slug`, `position`, `name`, `qty?`, `unit?`, `product_slug?`, `blend_slug?`, `optional` | Points to either a product or a blend |
| `recipe_ratings` | `recipe_slug`, `user_email`, `stars` (1–5), `note?`, `updated_at` | Primary key is (`recipe_slug`, `user_email`) |
| `recipe_cooked` | `id`, `recipe_slug`, `cooked_at`, `user_email` | Optional "last cooked" log |
| `meta` | `key`, `value` | Content hash, schema info |

Default sections (AU naming): Fruit & Veg, Meat & Seafood, Deli, Dairy & Eggs, Bakery, Pantry, Herbs & Spices, International, Frozen, Snacks, Drinks, Household, Other.

## Features in detail

### 1. Shopping list

- **Autocomplete runs on the client.** The catalog (about 1,000 AU grocery items, roughly 50 KB gzipped) and the household history load once and are cached by TanStack Query and the PWA. Matching is a local fuzzy prefix/trigram score: history first (by `use_count` and recency), then the catalog. It's instant, works offline, and costs no requests. Free text is always allowed.
- **Section classification** (`classify.ts`), checked in this order:
  1. The household's own section override from `item_history`
  2. The catalog product's section
  3. Keyword rules (e.g. "*mince" → Meat & Seafood, "frozen *" → Frozen)
  4. Other
  
  Moving an item to another section updates `item_history`, so the app learns.
- **Merging:** adding an item that is already on the list (and unchecked) increases its quantity when the units match. Otherwise both lines stay next to each other.
- **Live sync:**
  - Each mutation writes to SQLite, bumps `version`, then emits `{ type: "item.upsert" | "item.delete" | "list.clear", ... }`.
  - The `list.onChange` subscription streams these events. The client patches the TanStack Query cache, and mutations are optimistic.
  - On (re)connect the client refetches the full list.
  - Conflicts resolve last-write-wins per item.
  - The server sends a keep-alive ping every 25 seconds.
- **UX:**
  - Grouped by section in store order, with checked items collapsed at the bottom.
  - Tap to check, swipe to delete, "Clear checked", and a "for: Chicken Tacos" chip on items added from a recipe.
  - Small haptic feedback via `navigator.vibrate` where supported.

### 2. Recipes (read-only)

- **List view:** cards with image, title, time, household average rating and your own rating. Filter by tag, search by title, and sort by rating, recently added, or not tried yet.
- **Detail view:** hero image, ingredients scaled by a servings picker (2/4), steps, rating stars plus a note, and a "Cooked it" button.
- **Add to list flow:**
  1. Tap "Add to list". A bottom drawer opens with the servings picker.
  2. The drawer lists every ingredient under the heading "Already have it?". Items marked `usually_have` (salt, olive oil, etc.) start toggled as "have".
  3. Each blend ingredient has a toggle: **Buy blend** or **Make from scratch**. Scratch expands the blend's components recursively (with a cycle guard), and they show up in the same checklist.
  4. Confirm adds only the missing items (merged into the list and tagged with the recipe). Your answers update `usually_have` for next time.
- **Blends:**
  - Blends are recipes with `kind: "blend"`, kept in `content/blends/`. Common HelloFresh AU blends are seeded (American Spice Blend, Mexican Fiesta, Aussie Spice Blend, Tuscan Heat, Garlic & Herb, Middle Eastern, etc.) with their published components.
  - The recipe detail view shows the dependency tree, e.g. "American Spice Blend → paprika, garlic powder, onion powder, ...", and each blend links to its own page.

### 3. Images

- Only URLs are stored, in the content JSON and the synced DB. Nothing is uploaded anywhere.
- **Recipes:** the source page's image, e.g. the HelloFresh CDN URL with a size transformation for thumbnails, or the `og:image` / JSON-LD image for other sites.
- **Products:** the HelloFresh ingredient image when available, otherwise TheMealDB ingredient images (`https://www.themealdb.com/images/ingredients/<Name>-Small.png`), matched when the catalog is built.
- **Fallback:** if an image fails to load, the client shows the section emoji. Images use `loading="lazy"`, and the PWA service worker caches them at runtime.

### 4. Auth

- **Cloudflare Access** guards the whole `workers.dev` hostname, with Google as the only login method, so the login page goes straight to Google.
  - Allow-list: the emails in `household_members` (Terraform variable kept in the gitignored `terraform.tfvars`).
  - Session duration: 1 month (the maximum).
  - Preview URLs are also protected, or disabled.
- **The Worker verifies the JWT on every API request.** Requests without a valid JWT get a 401, so the API is protected even without Access in front.
- **Expired sessions:** API calls get a cross-origin redirect to the Access login, which shows up in the browser as a network/CORS error. The tRPC client treats that (or a 401) as an expired session and does a full page reload, which goes through Access and Google again.
- **iOS home-screen apps** keep their own cookie jar, so you log in once inside the installed app.
- **Local dev:** with no Access in front, the Worker uses `DEV_USER_EMAIL` (switchable from a dev-only menu) to test two users.

## Recipe content workflow

Recipes aren't created in the app. They live in the repo:

```
content/
  catalog.json            # known products: slug, name, aliases, section, imageUrl
  blends/american-spice-blend.json
  recipes/hf-chicken-tacos-with-pickled-onion.json
```

Example recipe file:

```json
{
  "slug": "hf-chicken-tacos-with-pickled-onion",
  "kind": "meal",
  "title": "Chicken Tacos with Pickled Onion",
  "sourceUrl": "https://www.hellofresh.com.au/recipes/...",
  "imageUrl": "https://img.hellofresh.com/...",
  "servings": 2,
  "prepMinutes": 30,
  "tags": ["hellofresh", "mexican", "quick"],
  "ingredients": [
    { "name": "Chicken breast", "qty": 250, "unit": "g", "product": "chicken-breast" },
    { "name": "American Spice Blend", "qty": 1, "unit": "sachet", "blend": "american-spice-blend" },
    { "name": "Salt", "product": "salt", "optional": true }
  ],
  "steps": ["...", "..."]
}
```

To add a recipe (you ask, I do it):

1. Run `pnpm recipe:import <url>`. This is a local Node script, not part of the Worker.
   - HelloFresh AU pages are parsed from `__NEXT_DATA__`, which has structured ingredients with amounts, units and ingredient images. JSON-LD `Recipe` is the fallback.
   - Other sites are parsed from JSON-LD `Recipe`, with free-text ingredients parsed by `parse-ingredient`. Anything else is written by hand.
2. The script matches ingredients to the catalog and blends, converts to metric, writes the JSON file, and prints a report of unmatched ingredients and missing images to review.
3. Commit and push. CI runs `wrangler deploy`. The content is bundled into the Worker, and the Durable Object syncs it on the next request because the content hash changed. Ratings and history are kept because they key on slugs.

## Repository layout

```
weeklyshopping/
├─ src/
│  ├─ client/                 # React PWA
│  │  ├─ routes/              # list, recipes, recipes.$slug, settings
│  │  ├─ components/ui/       # shadcn components
│  │  ├─ features/{list,recipes,autocomplete}/
│  │  └─ lib/{trpc.ts,auth-expiry.ts}
│  ├─ worker/
│  │  ├─ index.ts             # Hono app: assets, /trpc → HouseholdDO
│  │  ├─ access.ts            # Cloudflare Access JWT verification
│  │  └─ household-do.ts      # Durable Object: migrations, content sync, tRPC handler, event emitter
│  ├─ server/
│  │  ├─ trpc.ts              # init, context, procedures
│  │  ├─ routers/{list,catalog,recipes,ratings,me}.ts
│  │  ├─ db/{schema.ts,migrations/}
│  │  └─ domain/{classify.ts,merge.ts,expand-blends.ts,scale.ts,content-sync.ts}
│  └─ shared/                 # zod schemas, section enum, event types
├─ content/                   # catalog, blends, recipes (JSON)
├─ config/household.json      # household id/name + local dev users (real member emails are secrets)
├─ scripts/
│  ├─ import-recipe.ts        # URL → content/recipes/*.json
│  └─ build-catalog.ts        # builds catalog.json and matches TheMealDB images
├─ infra/terraform/
│  ├─ versions.tf, providers.tf, variables.tf, outputs.tf
│  ├─ access.tf               # IdP (Google), Access application, allow-list policy
│  └─ README.md               # one-time setup steps
├─ tests/e2e/                 # Playwright
├─ wrangler.jsonc
├─ vite.config.ts
├─ drizzle.config.ts
└─ .github/workflows/ci.yml
```

## Infrastructure

### Terraform (`infra/terraform`)

Managed with the `cloudflare` provider:

- `cloudflare_zero_trust_access_identity_provider`: type `google`, with client ID and secret passed in as sensitive variables.
- `cloudflare_zero_trust_access_application`:
  - self-hosted, domain `weeklyshopping.<account>.workers.dev` (plus preview URLs)
  - `allowed_idps = [google]`, `auto_redirect_to_identity = true`
  - `session_duration = "730h"`
- Access policy (inline on the application): allow exactly the emails in `var.household_members`.
- `scripts/sync-github.sh` copies the outputs to GitHub: `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` as variables (passed to `wrangler deploy --var`) and the member list as the `HOUSEHOLD_MEMBERS` secret (pushed to the Worker with `wrangler secret put`).

State stays in a local, gitignored file.

### One-time manual setup (documented in `infra/terraform/README.md`)

1. Create a Cloudflare account, choose a `workers.dev` subdomain, and enable the Zero Trust free plan by choosing a team name. Cloudflare may ask for a payment card even on the free plan.
2. In Google Cloud Console:
   - Create an OAuth consent screen (External; scopes: email, profile, openid) and publish it.
   - Create an OAuth client ID (Web) with the redirect URI `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`.
3. Create a Cloudflare API token with permissions for Access (apps, policies, IdPs) and Workers Scripts edit.
4. Run `terraform apply`, then `scripts/sync-github.sh`, then push to `main` (GitHub Actions deploys).

### Worker deploy

- `wrangler.jsonc` defines:
  - the Worker with static assets
  - the `HOUSEHOLD` Durable Object binding (a SQLite class, via `new_sqlite_classes` in `migrations`)
  - vars: `DEV_AUTH` (localhost only), optional `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` overrides
- `pnpm run deploy` runs `vite build && wrangler deploy`. CI does the same on push to `main` using a `CLOUDFLARE_API_TOKEN` secret.

## Local environment

- `pnpm install && pnpm dev` starts Vite with `@cloudflare/vite-plugin`: React with HMR, the Worker and the Durable Object all run locally in workerd/Miniflare. SQLite data persists under `.wrangler/state`.
- `DEV_USER_EMAIL` sets the fake identity. A dev-only user switcher lets you open two browser profiles as two different people to test live sync.
- `pnpm dev:reset` wipes local Durable Object state. Content (catalog, recipes, blends) syncs automatically on first request.
- `pnpm build && pnpm preview` runs the production build locally on workerd, which is closest to prod.
- Tests:
  - `pnpm test`: unit tests for classify, merge, scale, expand-blends and content sync, plus Durable Object tests with `vitest-pool-workers`.
  - `pnpm test:e2e`: Playwright with two browser contexts. Add an item in A and it appears in B within 1 second. The recipe → pantry check → list flow is covered too.
- `pnpm tf:check` runs `terraform fmt -check` and `terraform validate`. It's offline and also runs in CI.

## Cost

| Item | Free allowance | Expected use |
|---|---|---|
| Workers requests | 100k/day | hundreds/day |
| Worker CPU | 10 ms per request (CPU only; waiting on SSE doesn't count) | ~1–3 ms |
| Static assets | unlimited | — |
| Durable Object requests | 100k/day | hundreds/day |
| Durable Object duration | 13,000 GB-s/day | ≤ 10,800 even with a stream open 24/7 |
| Durable Object SQLite | 5 GB, 5M rows read and 100k rows written per day | a few MB |
| `workers.dev` + HTTPS | free | — |
| Zero Trust (Access) | free up to 50 users | 2 |
| Google OAuth | free (basic scopes, no verification needed) | — |
| Terraform, GitHub Actions | free | — |

**Total: $0/month.** If usage ever grows past the free tier, Workers Paid is $5/month.

## Milestones

1. **Scaffold:** pnpm project, Vite + React + Tailwind + shadcn, Worker + Hono, HouseholdDO with Drizzle migrations, tRPC wiring, `pnpm dev` working end to end, CI with typecheck and tests.
2. **Auth and shell:** Access JWT verification, dev identity switcher, auth-expiry handling, PWA manifest and icons, bottom tab bar (List / Recipes / Settings).
3. **Shopping list:** sections, CRUD, merging, history learning, AU catalog built with images, client-side autocomplete.
4. **Live sync:** SSE subscription, event emitter, optimistic updates, reconnect and refetch, two-browser Playwright test.
5. **Recipes:** content format and sync, list and detail views, servings scaling, ratings, cooked log.
6. **Add to list:** pantry-check drawer, `usually_have` learning, recipe tags on list items.
7. **Blends:** seeded HelloFresh AU blends, ingredient linking, dependency tree, buy-or-scratch expansion.
8. **Importer:** `pnpm recipe:import` for HelloFresh AU and JSON-LD sites, plus the first batch of recipes.
9. **Infra and launch:** Terraform for Access and Google, one-time setup README, CI deploy, production smoke test on both phones.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| HelloFresh changes its page structure | The importer only runs locally when adding a recipe, so the live app is unaffected. JSON-LD fallback, and manual JSON as a last resort. |
| Hotlinked images break or get blocked | Emoji fallback per section. Fix the URL in the content JSON and redeploy. |
| The Access session expires inside the installed PWA | Detect the failed request or 401 and do a full reload into the Access + Google flow. With a live Google session it's a single tap. |
| SSE drops on mobile networks or deploys | Automatic reconnect, then refetch the full list. Optimistic UI hides the gap. |
| Free tier limits | Usage is orders of magnitude below them. Errors appear instead of charges, and Workers Paid ($5) is available. |

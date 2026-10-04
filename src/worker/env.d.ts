// Secrets aren't in wrangler.jsonc, so `wrangler types` doesn't know about them.
interface Env {
  /** JSON array of { email, name } allowed to use the app. Set with `wrangler secret put HOUSEHOLD_MEMBERS`. */
  HOUSEHOLD_MEMBERS?: string;
}

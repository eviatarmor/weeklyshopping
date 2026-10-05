import { DurableObject } from "cloudflare:workers";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import * as schema from "../server/db/schema";
import { EventBus } from "../server/bus";
import { loadContent } from "../server/content";
import { ensureSections } from "../server/content-sync";
import { buildStore, type ContentStore } from "../server/content-store";
import { appRouter } from "../server/router";
import { fireDueTimers, nextTimerDue } from "../server/timers-service";
import { refreshOneIngredientPrice } from "../server/prices";
import { ingredientsToPrice } from "../server/recipe-cost";

/** One ingredient price every two minutes while recipe costs are being filled in. */
const PRICE_REFRESH_EVERY_MS = 2 * 60_000;
import { IDENTITY_HEADER, type Identity } from "./identity";

/** One instance per household: owns its SQLite database and live-update fan-out. */
export class HouseholdDO extends DurableObject<Env> {
  private db: DrizzleSqliteDODatabase<typeof schema>;
  private bus = new EventBus();
  private store!: ContentStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    ctx.blockConcurrencyWhile(async () => {
      // Recipes and the catalog stay in memory (they ship with each deploy), so starting up
      // writes nothing to SQLite beyond first-time migrations and section defaults.
      this.store = buildStore(await loadContent());
      // Only write when something is actually missing: a failed write (e.g. the daily
      // row-write limit) would otherwise break every read that follows it.
      try {
        if (this.migrationsPending()) migrate(this.db, migrations);
        ensureSections(this.db);
        // Keep the alarm going (timers and the background price refresh share it).
        if (String(env.DEV_AUTH) !== "true" && (await ctx.storage.getAlarm()) == null) await ctx.storage.setAlarm(Date.now() + 60_000);
      } catch (error) {
        console.error("startup migration failed; serving read-only until it succeeds", error);
      }
    });
  }

  /** Read-only check: has the newest bundled migration been applied? */
  private migrationsPending(): boolean {
    const newest = Math.max(...migrations.journal.entries.map((e) => e.when));
    try {
      const row = this.ctx.storage.sql.exec<{ created_at: number }>("SELECT MAX(created_at) AS created_at FROM __drizzle_migrations").one();
      return !row.created_at || Number(row.created_at) < newest;
    } catch {
      return true; // fresh database: no migrations table yet
    }
  }

  /** When the background price refresh should run next (in memory; an alarm after a restart just runs it). */
  private nextPriceRefresh = 0;

  /** Wake up for the next cooking timer or the next background price refresh, whichever is first. */
  private async syncAlarm() {
    const timer = nextTimerDue(this.db);
    const refresh = String(this.env.DEV_AUTH) === "true" ? Infinity : this.nextPriceRefresh || Date.now() + PRICE_REFRESH_EVERY_MS;
    const due = Math.min(timer ?? Infinity, refresh);
    if (due === Infinity) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(due);
  }

  /** A timer is up (notify everyone) and/or it's time to refresh one ingredient price. */
  override async alarm() {
    const privateKey = String(this.env.VAPID_PRIVATE_KEY ?? "");
    const publicKey = String(this.env.VAPID_PUBLIC_KEY ?? "");
    await fireDueTimers(this.db, this.bus, this.store, privateKey && publicKey ? { publicKey, privateKey } : null);
    // Local dev and tests never call the real supermarkets in the background.
    const local = String(this.env.DEV_AUTH) === "true";
    if (!local && Date.now() >= this.nextPriceRefresh) {
      let more = true;
      try {
        more = await refreshOneIngredientPrice(this.db, ingredientsToPrice(this.store));
      } catch (error) {
        console.error("background price refresh failed", error);
      }
      // Slowly while there's work (stores don't like bursts), then check again in a few hours.
      this.nextPriceRefresh = Date.now() + (more ? PRICE_REFRESH_EVERY_MS : 6 * 60 * 60_000);
    }
    await this.syncAlarm();
  }

  override async fetch(request: Request): Promise<Response> {
    const raw = request.headers.get(IDENTITY_HEADER);
    const identity = raw ? (JSON.parse(decodeURIComponent(raw)) as Identity) : null;

    return fetchRequestHandler({
      endpoint: "/trpc",
      req: request,
      router: appRouter,
      createContext: () => ({
        db: this.db,
        bus: this.bus,
        user: identity?.user ?? null,
        household: identity?.household ?? { id: "", name: "", members: [] },
        store: this.store,
        accessTeamDomain: String(this.env.ACCESS_TEAM_DOMAIN ?? ""),
        origin: new URL(request.url).origin,
        vapidPublicKey: String(this.env.VAPID_PUBLIC_KEY ?? ""),
        syncAlarm: () => this.syncAlarm(),
      }),
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
      },
    });
  }
}

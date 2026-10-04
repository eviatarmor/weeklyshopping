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
      }),
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
      },
    });
  }
}

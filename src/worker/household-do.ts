import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
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
  private knownUsers = new Set<string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    ctx.blockConcurrencyWhile(async () => {
      // Recipes and the catalog stay in memory (they ship with each deploy), so starting up
      // writes nothing to SQLite beyond first-time migrations and section defaults.
      this.store = buildStore(await loadContent());
      try {
        migrate(this.db, migrations);
        ensureSections(this.db);
      } catch (error) {
        // e.g. the daily row-write limit: keep serving reads rather than failing every request.
        console.error("startup migration failed; serving read-only until it succeeds", error);
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const raw = request.headers.get(IDENTITY_HEADER);
    const identity = raw ? (JSON.parse(decodeURIComponent(raw)) as Identity) : null;
    if (identity && !this.knownUsers.has(identity.user.email)) {
      // Record the user once; never let this bookkeeping write block a request
      // (e.g. when the daily write limit is reached, reads must keep working).
      try {
        const existing = this.db.select().from(schema.users).where(eq(schema.users.email, identity.user.email)).get();
        if (!existing || existing.displayName !== identity.user.name) {
          this.db
            .insert(schema.users)
            .values({ email: identity.user.email, displayName: identity.user.name })
            .onConflictDoUpdate({ target: schema.users.email, set: { displayName: identity.user.name } })
            .run();
        }
        this.knownUsers.add(identity.user.email);
      } catch (error) {
        console.error("could not record user", error);
      }
    }

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

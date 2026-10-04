import { DurableObject } from "cloudflare:workers";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import * as schema from "../server/db/schema";
import { EventBus } from "../server/bus";
import { loadContent } from "../server/content";
import { ensureSections, syncContent } from "../server/content-sync";
import { appRouter } from "../server/router";
import { IDENTITY_HEADER, type Identity } from "./identity";

/** One instance per household: owns its SQLite database and live-update fan-out. */
export class HouseholdDO extends DurableObject<Env> {
  private db: DrizzleSqliteDODatabase<typeof schema>;
  private bus = new EventBus();
  private contentHash = "";
  private knownUsers = new Set<string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.db, migrations);
      ensureSections(this.db);
      const content = await loadContent();
      const result = syncContent(this.db, content);
      if (result.catalog || result.upserted || result.deleted) console.log("content sync", result);
      this.contentHash = content.version;
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const raw = request.headers.get(IDENTITY_HEADER);
    const identity = raw ? (JSON.parse(decodeURIComponent(raw)) as Identity) : null;
    if (identity && !this.knownUsers.has(identity.user.email)) {
      this.db
        .insert(schema.users)
        .values({ email: identity.user.email, displayName: identity.user.name })
        .onConflictDoUpdate({ target: schema.users.email, set: { displayName: identity.user.name } })
        .run();
      this.knownUsers.add(identity.user.email);
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
        contentHash: this.contentHash,
      }),
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
      },
    });
  }
}

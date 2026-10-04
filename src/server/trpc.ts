import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type * as schema from "./db/schema";
import type { EventBus } from "./bus";
import type { ContentStore } from "./content-store";

export type User = { email: string; name: string };

export type Context = {
  db: DrizzleSqliteDODatabase<typeof schema>;
  bus: EventBus;
  user: User | null;
  household: { id: string; name: string; members: User[] };
  /** Recipes and catalog for this deploy, held in memory. */
  store: ContentStore;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  sse: {
    ping: { enabled: true, intervalMs: 25_000 },
    client: { reconnectAfterInactivityMs: 40_000 },
  },
});

export const router = t.router;

export const WRITE_LIMIT_MESSAGE =
  "Today's free database limit is used up, so changes can't be saved right now. Saving works again after midnight UTC (10–11am in Australia).";

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const result = await next({ ctx: { ...ctx, user: ctx.user } });
  // Turn Cloudflare's raw storage-limit error into something a person can act on.
  if (!result.ok && /Exceeded allowed rows written/i.test(String(result.error.cause?.message ?? result.error.message))) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: WRITE_LIMIT_MESSAGE, cause: result.error });
  }
  return result;
});

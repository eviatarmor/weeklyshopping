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

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

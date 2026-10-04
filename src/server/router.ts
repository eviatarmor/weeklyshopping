import { protectedProcedure, router } from "./trpc";
import { catalogRouter } from "./routers/catalog";
import { listRouter } from "./routers/list";
import { recipesRouter } from "./routers/recipes";
import { pricesRouter } from "./routers/prices";
import { timersRouter } from "./routers/timers";
import { weekRouter } from "./routers/week";

export const appRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({ user: ctx.user, household: ctx.household, accessTeamDomain: ctx.accessTeamDomain })),
  list: listRouter,
  catalog: catalogRouter,
  recipes: recipesRouter,
  week: weekRouter,
  timers: timersRouter,
  prices: pricesRouter,
});

export type AppRouter = typeof appRouter;

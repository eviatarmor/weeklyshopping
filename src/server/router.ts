import { protectedProcedure, router } from "./trpc";
import { catalogRouter } from "./routers/catalog";
import { listRouter } from "./routers/list";
import { recipesRouter } from "./routers/recipes";

export const appRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({ user: ctx.user, household: ctx.household })),
  list: listRouter,
  catalog: catalogRouter,
  recipes: recipesRouter,
});

export type AppRouter = typeof appRouter;

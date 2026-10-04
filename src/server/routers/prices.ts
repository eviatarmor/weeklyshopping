import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { priceFor } from "../prices";

/** Cheapest vegetarian match and best value per kg/litre across Woolworths, Coles and IGA. */
export const pricesRouter = router({
  compare: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120) })).query(({ ctx, input }) => priceFor(ctx.db, input.name)),
});

import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { recipeCooked, recipeRatings } from "../db/schema";
import { addItems, setUsuallyHave } from "../list-service";
import { recommend } from "../recommend";

/**
 * Recipe content itself is served as static files (/data/...), so these
 * procedures only deal with per-household data: ratings, cooked history and
 * recommendations.
 */

/** Read user data, but never let a storage error hide the recipes themselves. */
function safeRead<T>(read: () => T[]): T[] {
  try {
    return read();
  } catch (error) {
    console.error("user data read failed", error);
    return [];
  }
}

export type RecipeStats = { avgStars: number | null; ratingCount: number; myStars: number | null; timesCooked: number; lastCookedAt: number | null };

export const recipesRouter = router({
  /** Ratings and cooked counts for every recipe that has any, keyed by slug. */
  stats: protectedProcedure.query(({ ctx }) => {
    const stats: Record<string, RecipeStats> = {};
    const entry = (slug: string) => (stats[slug] ??= { avgStars: null, ratingCount: 0, myStars: null, timesCooked: 0, lastCookedAt: null });
    const sums: Record<string, number> = {};
    for (const r of safeRead(() => ctx.db.select().from(recipeRatings).all())) {
      const s = entry(r.recipeSlug);
      s.ratingCount++;
      sums[r.recipeSlug] = (sums[r.recipeSlug] ?? 0) + r.stars;
      s.avgStars = sums[r.recipeSlug]! / s.ratingCount;
      if (r.userEmail === ctx.user.email) s.myStars = r.stars;
    }
    for (const c of safeRead(() => ctx.db.select().from(recipeCooked).all())) {
      const s = entry(c.recipeSlug);
      s.timesCooked++;
      s.lastCookedAt = Math.max(s.lastCookedAt ?? 0, c.cookedAt);
    }
    return stats;
  }),

  /** Ratings (with names) and recent cooks for one recipe. */
  activity: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }) => {
    const members = new Map(ctx.household.members.map((m) => [m.email, m.name]));
    const ratings = safeRead(() => ctx.db.select().from(recipeRatings).where(eq(recipeRatings.recipeSlug, input.slug)).all()).map((r) => ({
      ...r,
      name: members.get(r.userEmail) ?? r.userEmail,
      mine: r.userEmail === ctx.user.email,
    }));
    const cooked = safeRead(() =>
      ctx.db.select().from(recipeCooked).where(eq(recipeCooked.recipeSlug, input.slug)).orderBy(desc(recipeCooked.cookedAt)).limit(10).all(),
    );
    return { ratings, cooked };
  }),

  /** Meals similar to what this user rated highly (and unlike what they rated low). */
  recommended: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(30).default(12) }).optional()).query(({ ctx, input }) => {
    try {
      return recommend(ctx.db, ctx.store, ctx.user.email, input?.limit ?? 12);
    } catch (error) {
      console.error("recommendations failed", error);
      return { basedOn: 0, items: [] };
    }
  }),

  rate: protectedProcedure
    .input(z.object({ slug: z.string(), stars: z.number().int().min(1).max(5).nullable(), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => {
      const key = and(eq(recipeRatings.recipeSlug, input.slug), eq(recipeRatings.userEmail, ctx.user.email));
      if (input.stars === null) {
        ctx.db.delete(recipeRatings).where(key).run();
        return;
      }
      ctx.db
        .insert(recipeRatings)
        .values({ recipeSlug: input.slug, userEmail: ctx.user.email, stars: input.stars, note: input.note ?? null, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: [recipeRatings.recipeSlug, recipeRatings.userEmail],
          set: { stars: input.stars, note: input.note ?? null, updatedAt: Date.now() },
        })
        .run();
    }),

  markCooked: protectedProcedure.input(z.object({ slug: z.string() })).mutation(({ ctx, input }) => {
    ctx.db.insert(recipeCooked).values({ recipeSlug: input.slug, userEmail: ctx.user.email }).run();
  }),

  /** Add the lines the user doesn't have; remember the ones they do. */
  addToList: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        lines: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              qty: z.number().positive().nullable(),
              unit: z.string().nullable(),
              productSlug: z.string().nullable(),
              imageUrl: z.string().nullable(),
              have: z.boolean(),
            }),
          )
          .max(200),
      }),
    )
    .mutation(({ ctx, input }) => {
      const recipe = ctx.store.bySlug.get(input.slug);
      if (!recipe) throw new TRPCError({ code: "NOT_FOUND" });
      const needed = input.lines.filter((l) => !l.have);
      const items = addItems(
        ctx.db,
        ctx.user,
        ctx.store,
        needed.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, productSlug: l.productSlug, imageUrl: l.imageUrl, sourceRecipeSlug: recipe.slug })),
      );
      setUsuallyHave(
        ctx.db,
        input.lines.map((l) => ({ name: l.name, productSlug: l.productSlug, have: l.have })),
        ctx.store,
      );
      if (items.length) ctx.bus.emit({ type: "items.upsert", items });
      ctx.bus.emit({ type: "history.changed" });
      return { added: items.length, skipped: input.lines.length - needed.length };
    }),
});

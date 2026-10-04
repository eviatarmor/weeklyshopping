import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { BlendRecipe, IngredientRow } from "@/shared/expand";
import { recipeSource } from "@/shared/sources";
import { protectedProcedure, router, type Context } from "../trpc";
import { itemHistory, recipeCooked, recipeRatings } from "../db/schema";
import type { ContentStore, StoreRecipe } from "../content-store";
import { addItems, setUsuallyHave } from "../list-service";
import { recommend } from "../recommend";

type DB = Context["db"];

/** All blends reachable from `rows`, keyed by slug. */
function collectBlends(store: ContentStore, rows: IngredientRow[]): Record<string, BlendRecipe> {
  const blends: Record<string, BlendRecipe> = {};
  const pending = [...rows];
  while (pending.length) {
    const slug = pending.pop()!.blendSlug;
    if (!slug || blends[slug]) continue;
    const b = store.bySlug.get(slug);
    if (!b) continue;
    blends[slug] = { slug: b.slug, title: b.title, servings: b.servings, yieldUnit: b.yieldUnit, ingredients: b.ingredients };
    pending.push(...b.ingredients);
  }
  return blends;
}

/** Card data for recipe lists: ratings and cooked history grouped per recipe. */
function summaries(db: DB, userEmail: string, list: StoreRecipe[]) {
  const ratingsBySlug = new Map<string, (typeof recipeRatings.$inferSelect)[]>();
  for (const r of db.select().from(recipeRatings).all()) ratingsBySlug.set(r.recipeSlug, [...(ratingsBySlug.get(r.recipeSlug) ?? []), r]);
  const cookedBySlug = new Map<string, number[]>();
  for (const c of db.select().from(recipeCooked).all()) cookedBySlug.set(c.recipeSlug, [...(cookedBySlug.get(c.recipeSlug) ?? []), c.cookedAt]);
  return list.map((r) => {
    const ratings = ratingsBySlug.get(r.slug) ?? [];
    const cookedTimes = cookedBySlug.get(r.slug) ?? [];
    return {
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      imageUrl: r.imageUrl,
      source: recipeSource(r.sourceUrl),
      prepMinutes: r.prepMinutes,
      kcal: r.kcal,
      tags: r.tags,
      addedAt: r.addedAt,
      avgStars: ratings.length ? ratings.reduce((s, x) => s + x.stars, 0) / ratings.length : null,
      ratingCount: ratings.length,
      myStars: ratings.find((x) => x.userEmail === userEmail)?.stars ?? null,
      timesCooked: cookedTimes.length,
      lastCookedAt: cookedTimes.length ? Math.max(...cookedTimes) : null,
    };
  });
}

export const recipesRouter = router({
  list: protectedProcedure.input(z.object({ kind: z.enum(["meal", "blend"]).default("meal") }).optional()).query(({ ctx, input }) => {
    const kind = input?.kind ?? "meal";
    return summaries(ctx.db, ctx.user.email, ctx.store.recipes.filter((r) => r.kind === kind));
  }),

  /** Meals similar to what this user rated highly (and unlike what they rated low). */
  recommended: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(30).default(12) }).optional()).query(({ ctx, input }) => {
    const result = recommend(ctx.db, ctx.store, ctx.user.email, input?.limit ?? 12);
    const picked = result.items.map((i) => ctx.store.bySlug.get(i.slug)).filter((r): r is StoreRecipe => !!r);
    const bySlug = new Map(summaries(ctx.db, ctx.user.email, picked).map((s) => [s.slug, s]));
    return {
      basedOn: result.basedOn,
      items: result.items.flatMap((i) => {
        const summary = bySlug.get(i.slug);
        return summary ? [{ ...summary, because: i.because }] : [];
      }),
    };
  }),

  get: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }) => {
    const found = ctx.store.bySlug.get(input.slug);
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    const { ingredients, ...recipe } = found;
    const blends = collectBlends(ctx.store, ingredients);

    const allRows = [ingredients, ...Object.values(blends).map((b) => b.ingredients)].flat();
    const productImages = Object.fromEntries(
      [...new Set(allRows.map((r) => r.productSlug).filter((s): s is string => !!s))].map((slug) => [slug, ctx.store.productBySlug.get(slug)?.imageUrl ?? null]),
    );
    const usuallyHave = ctx.db
      .select({ normalizedName: itemHistory.normalizedName })
      .from(itemHistory)
      .where(eq(itemHistory.usuallyHave, true))
      .all()
      .map((h) => h.normalizedName);

    const members = new Map(ctx.household.members.map((m) => [m.email, m.name]));
    const ratings = ctx.db
      .select()
      .from(recipeRatings)
      .where(eq(recipeRatings.recipeSlug, recipe.slug))
      .all()
      .map((r) => ({ ...r, name: members.get(r.userEmail) ?? r.userEmail, mine: r.userEmail === ctx.user.email }));
    const cooked = ctx.db
      .select()
      .from(recipeCooked)
      .where(eq(recipeCooked.recipeSlug, recipe.slug))
      .orderBy(desc(recipeCooked.cookedAt))
      .limit(10)
      .all();
    const usedIn = recipe.kind === "blend" ? (ctx.store.usedBy.get(recipe.slug) ?? []).map((r) => ({ slug: r.slug, title: r.title })) : [];

    return { recipe, ingredients, blends, productImages, usuallyHave, ratings, cooked, usedIn };
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

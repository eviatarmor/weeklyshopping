import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { BlendRecipe, IngredientRow } from "@/shared/expand";
import { recipeSource } from "@/shared/sources";
import { protectedProcedure, router, type Context } from "../trpc";
import { itemHistory, products, recipeCooked, recipeIngredients, recipeRatings, recipes } from "../db/schema";
import { addItems, setUsuallyHave } from "../list-service";

type DB = Context["db"];

function ingredientRows(db: DB, slugs: string[]): Map<string, IngredientRow[]> {
  const out = new Map<string, IngredientRow[]>();
  if (slugs.length === 0) return out;
  const rows = db
    .select()
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeSlug, slugs))
    .orderBy(asc(recipeIngredients.position))
    .all();
  for (const r of rows) {
    const list = out.get(r.recipeSlug) ?? [];
    list.push({ name: r.name, qty: r.qty, unit: r.unit, productSlug: r.productSlug, blendSlug: r.blendSlug, optional: r.optional, pantry: r.pantry, imageUrl: r.imageUrl });
    out.set(r.recipeSlug, list);
  }
  return out;
}

/** All blends reachable from `rows`, keyed by slug. */
function collectBlends(db: DB, rows: IngredientRow[]): Record<string, BlendRecipe> {
  const blends: Record<string, BlendRecipe> = {};
  let pending = [...new Set(rows.map((r) => r.blendSlug).filter((s): s is string => !!s))];
  while (pending.length) {
    const found = db.select().from(recipes).where(inArray(recipes.slug, pending)).all();
    const ingredients = ingredientRows(db, pending);
    const next: string[] = [];
    for (const b of found) {
      const list = ingredients.get(b.slug) ?? [];
      blends[b.slug] = { slug: b.slug, title: b.title, servings: b.servings, yieldUnit: b.yieldUnit, ingredients: list };
      for (const i of list) if (i.blendSlug && !blends[i.blendSlug]) next.push(i.blendSlug);
    }
    pending = [...new Set(next)].filter((s) => !blends[s]);
  }
  return blends;
}

export const recipesRouter = router({
  list: protectedProcedure.input(z.object({ kind: z.enum(["meal", "blend"]).default("meal") }).optional()).query(({ ctx, input }) => {
    const kind = input?.kind ?? "meal";
    const all = ctx.db.select().from(recipes).where(eq(recipes.kind, kind)).all();
    const ratings = ctx.db.select().from(recipeRatings).all();
    const cooked = ctx.db.select().from(recipeCooked).all();
    return all.map((r) => {
      const mine = ratings.filter((x) => x.recipeSlug === r.slug);
      const cookedTimes = cooked.filter((c) => c.recipeSlug === r.slug).map((c) => c.cookedAt);
      return {
        slug: r.slug,
        title: r.title,
        subtitle: r.subtitle,
        imageUrl: r.imageUrl,
        source: recipeSource(r.sourceUrl),
        prepMinutes: r.prepMinutes,
        tags: r.tags,
        addedAt: r.addedAt,
        avgStars: mine.length ? mine.reduce((s, x) => s + x.stars, 0) / mine.length : null,
        ratingCount: mine.length,
        myStars: mine.find((x) => x.userEmail === ctx.user.email)?.stars ?? null,
        timesCooked: cookedTimes.length,
        lastCookedAt: cookedTimes.length ? Math.max(...cookedTimes) : null,
      };
    });
  }),

  get: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }) => {
    const recipe = ctx.db.select().from(recipes).where(eq(recipes.slug, input.slug)).get();
    if (!recipe) throw new TRPCError({ code: "NOT_FOUND" });
    const ingredients = ingredientRows(ctx.db, [recipe.slug]).get(recipe.slug) ?? [];
    const blends = collectBlends(ctx.db, ingredients);

    const allRows = [ingredients, ...Object.values(blends).map((b) => b.ingredients)].flat();
    const productSlugs = [...new Set(allRows.map((r) => r.productSlug).filter((s): s is string => !!s))];
    const productImages = Object.fromEntries(
      (productSlugs.length
        ? ctx.db.select({ slug: products.slug, imageUrl: products.imageUrl }).from(products).where(inArray(products.slug, productSlugs)).all()
        : []
      ).map((p) => [p.slug, p.imageUrl]),
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
    const usedIn =
      recipe.kind === "blend"
        ? ctx.db
            .selectDistinct({ slug: recipes.slug, title: recipes.title })
            .from(recipeIngredients)
            .innerJoin(recipes, eq(recipes.slug, recipeIngredients.recipeSlug))
            .where(eq(recipeIngredients.blendSlug, recipe.slug))
            .all()
        : [];

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
      const recipe = ctx.db.select({ slug: recipes.slug }).from(recipes).where(eq(recipes.slug, input.slug)).get();
      if (!recipe) throw new TRPCError({ code: "NOT_FOUND" });
      const needed = input.lines.filter((l) => !l.have);
      const items = addItems(
        ctx.db,
        ctx.user,
        ctx.contentHash,
        needed.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, productSlug: l.productSlug, imageUrl: l.imageUrl, sourceRecipeSlug: recipe.slug })),
      );
      setUsuallyHave(
        ctx.db,
        input.lines.map((l) => ({ name: l.name, productSlug: l.productSlug, have: l.have })),
        ctx.contentHash,
      );
      if (items.length) ctx.bus.emit({ type: "items.upsert", items });
      ctx.bus.emit({ type: "history.changed" });
      return { added: items.length, skipped: input.lines.length - needed.length };
    }),
});

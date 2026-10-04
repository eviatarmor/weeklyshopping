import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { searchMatcher } from "@/shared/search";
import { recipeSource } from "@/shared/sources";
import type { RecipeIndexEntry } from "@/shared/recipe-types";
import type { CookingProgress } from "@/shared/types";
import { protectedProcedure, router, type Context } from "../trpc";
import { recipeCooked, recipeProgress, recipeRatings } from "../db/schema";
import { addItems, setUsuallyHave } from "../list-service";
import { recommend } from "../recommend";
import { indexEntry, recipeDetail, type ContentStore, type StoreRecipe } from "../content-store";

type DB = Context["db"];

/**
 * Recipe content lives in memory (see content-store.ts) and is filtered and paged
 * here; ratings, cooked history and cooking progress come from SQLite.
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

export type RecipeCard = RecipeIndexEntry & RecipeStats;

const NO_STATS: RecipeStats = { avgStars: null, ratingCount: 0, myStars: null, timesCooked: 0, lastCookedAt: null };

/** Ratings and cooked counts for every recipe that has any. */
function loadStats(db: DB, userEmail: string): Map<string, RecipeStats> {
  const stats = new Map<string, RecipeStats>();
  const entry = (slug: string) => {
    let s = stats.get(slug);
    if (!s) stats.set(slug, (s = { ...NO_STATS }));
    return s;
  };
  const sums = new Map<string, number>();
  for (const r of safeRead(() => db.select().from(recipeRatings).all())) {
    const s = entry(r.recipeSlug);
    s.ratingCount++;
    sums.set(r.recipeSlug, (sums.get(r.recipeSlug) ?? 0) + r.stars);
    s.avgStars = sums.get(r.recipeSlug)! / s.ratingCount;
    if (r.userEmail === userEmail) s.myStars = r.stars;
  }
  for (const c of safeRead(() => db.select().from(recipeCooked).all())) {
    const s = entry(c.recipeSlug);
    s.timesCooked++;
    s.lastCookedAt = Math.max(s.lastCookedAt ?? 0, c.cookedAt);
  }
  return stats;
}

const toCard = (r: StoreRecipe, stats: Map<string, RecipeStats>): RecipeCard => ({ ...indexEntry(r), ...(stats.get(r.slug) ?? NO_STATS) });

/** Tags that say where a recipe came from (or repeat a sort option) rather than what it is. */
const NON_FILTER_TAGS = new Set(["hellofresh", "everyplate", "mealime", "dinnerly", "reddit", "blend", "sauce", "vegetarian", "quick"]);

const SORTS = ["top", "foryou", "new", "untried", "quick"] as const;

function sortCards(list: RecipeCard[], sort: Exclude<(typeof SORTS)[number], "foryou"> | "title"): RecipeCard[] {
  const byTitle = (a: RecipeCard, b: RecipeCard) => a.title.localeCompare(b.title);
  switch (sort) {
    case "top":
      return list.sort((a, b) => (b.avgStars ?? 0) - (a.avgStars ?? 0) || b.timesCooked - a.timesCooked || byTitle(a, b));
    case "new":
      return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || byTitle(a, b));
    case "untried":
      return list.filter((r) => r.timesCooked === 0 && r.ratingCount === 0).sort(byTitle);
    case "quick":
      return list.filter((r) => r.prepMinutes != null).sort((a, b) => a.prepMinutes! - b.prepMinutes! || byTitle(a, b));
    case "title":
      return list.sort(byTitle);
  }
}

/** Source and tag chips for one tab (meals or blends), independent of the current filters. */
function facets(recipes: StoreRecipe[]) {
  const sources = new Map<string, { id: string; label: string; count: number }>();
  const tags = new Map<string, number>();
  for (const r of recipes) {
    const source = recipeSource(r.sourceUrl);
    const entry = sources.get(source.id) ?? { id: source.id, label: source.label, count: 0 };
    entry.count++;
    sources.set(source.id, entry);
    for (const t of r.tags) if (!NON_FILTER_TAGS.has(t)) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return {
    sources: [...sources.values()].sort((a, b) => b.count - a.count),
    tags: [...tags.entries()]
      .filter(([, n]) => n > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([t]) => t),
  };
}

function safeRecommend(db: DB, store: ContentStore, userEmail: string, limit: number) {
  try {
    return recommend(db, store, userEmail, limit).items;
  } catch (error) {
    console.error("recommendations failed", error);
    return [];
  }
}

export const recipesRouter = router({
  /** One page of recipe cards, filtered and sorted on the server. */
  list: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["meal", "blend"]).default("meal"),
        query: z.string().max(100).optional(),
        tag: z.string().max(60).nullish(),
        source: z.string().max(60).nullish(),
        /** Blends only: spice mixes or sauces. */
        blendType: z.enum(["spice", "sauce"]).nullish(),
        sort: z.enum(SORTS).default("top"),
        /** Only meals rated 4 stars or more. */
        favourites: z.boolean().optional(),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(60).default(40),
      }),
    )
    .query(({ ctx, input }) => {
      const isSauce = (r: StoreRecipe) => r.tags.includes("sauce");
      const ofKind = ctx.store.recipes.filter(
        (r) => r.kind === input.kind && (!input.blendType || isSauce(r) === (input.blendType === "sauce")),
      );
      const matches = input.query ? searchMatcher(input.query) : null;
      const filtered = ofKind.filter(
        (r) =>
          (!matches || matches(`${r.title} ${r.subtitle ?? ""}`)) &&
          (!input.tag || r.tags.includes(input.tag)) &&
          (!input.source || recipeSource(r.sourceUrl).id === input.source),
      );
      const stats = loadStats(ctx.db, ctx.user.email);
      let cards: (RecipeCard & { because?: string | null })[] = filtered.map((r) => toCard(r, stats));
      if (input.favourites) cards = cards.filter((c) => (c.myStars ?? c.avgStars ?? 0) >= 4);
      let sorted: typeof cards;
      if (input.kind === "meal" && input.sort === "foryou") {
        // "For you": meals like the ones you rated highly, best match first.
        const byScore = new Map(safeRecommend(ctx.db, ctx.store, ctx.user.email, 300).map((r, i) => [r.slug, { rank: i, because: r.because }]));
        sorted = cards
          .filter((c) => byScore.has(c.slug))
          .map((c) => ({ ...c, because: byScore.get(c.slug)!.because }))
          .sort((a, b) => byScore.get(a.slug)!.rank - byScore.get(b.slug)!.rank);
      } else {
        sorted = sortCards(cards, input.kind === "meal" && input.sort !== "foryou" ? input.sort : "title");
      }
      const items = sorted.slice(input.cursor, input.cursor + input.limit);
      const next = input.cursor + items.length;
      return {
        items,
        total: sorted.length,
        nextCursor: next < sorted.length ? next : null,
        // The chips don't depend on the search or other chips, so they only come with the first page.
        facets: input.cursor === 0 ? facets(ofKind) : null,
      };
    }),

  /** Cards for specific recipes (the week plan, recipe names on the list). */
  cards: protectedProcedure.input(z.object({ slugs: z.array(z.string().max(200)).max(200) })).query(({ ctx, input }) => {
    const stats = loadStats(ctx.db, ctx.user.email);
    return input.slugs.flatMap((slug) => {
      const r = ctx.store.bySlug.get(slug);
      return r ? [toCard(r, stats)] : [];
    });
  }),

  /** A recipe's content, from memory (never touches the database). */
  content: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }) => {
    const detail = recipeDetail(ctx.store, input.slug);
    if (!detail) throw new TRPCError({ code: "NOT_FOUND" });
    return detail;
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
      const result = recommend(ctx.db, ctx.store, ctx.user.email, input?.limit ?? 12);
      const stats = loadStats(ctx.db, ctx.user.email);
      return {
        basedOn: result.basedOn,
        items: result.items.flatMap((i) => {
          const r = ctx.store.bySlug.get(i.slug);
          return r ? [{ ...toCard(r, stats), because: i.because }] : [];
        }),
      };
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
    // Start with nothing ticked the next time this recipe is cooked.
    const cleared = ctx.db.delete(recipeProgress).where(eq(recipeProgress.recipeSlug, input.slug)).returning().all();
    if (cleared.length) ctx.bus.emit({ type: "progress.changed", slug: input.slug, progress: { steps: [], ingredients: [] } });
  }),

  /** Method steps and ingredients the household has ticked off for this recipe. */
  progress: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }): CookingProgress => {
    const row = safeRead(() => ctx.db.select().from(recipeProgress).where(eq(recipeProgress.recipeSlug, input.slug)).all())[0];
    return { steps: row?.doneSteps ?? [], ingredients: row?.doneIngredients ?? [] };
  }),

  setProgress: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        steps: z.array(z.number().int().min(0).max(200)).max(200),
        ingredients: z.array(z.string().regex(/^\d+(\/\d+)*$/).max(30)).max(500),
      }),
    )
    .mutation(({ ctx, input }): CookingProgress => {
      const progress = { steps: [...new Set(input.steps)].sort((a, b) => a - b), ingredients: [...new Set(input.ingredients)].sort() };
      if (progress.steps.length === 0 && progress.ingredients.length === 0) {
        ctx.db.delete(recipeProgress).where(eq(recipeProgress.recipeSlug, input.slug)).run();
      } else {
        const set = { doneSteps: progress.steps, doneIngredients: progress.ingredients, updatedAt: Date.now() };
        ctx.db
          .insert(recipeProgress)
          .values({ recipeSlug: input.slug, ...set })
          .onConflictDoUpdate({ target: recipeProgress.recipeSlug, set })
          .run();
      }
      ctx.bus.emit({ type: "progress.changed", slug: input.slug, progress });
      return progress;
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

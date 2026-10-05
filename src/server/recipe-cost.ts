import { desc, sql } from "drizzle-orm";
import table from "../../content/ingredient-nutrition.json";
import type { Offer, PriceComparison } from "@/shared/grocery";
import { searchKey } from "@/shared/search";
import { normalizeUnit } from "@/shared/units";
import { gramsPerUnit, isMealKit, type IngredientInfo } from "@/shared/weights";
import type { Context } from "./trpc";
import type { ContentStore, StoreRecipe } from "./content-store";
import { priceCache } from "./db/schema";

type DB = Context["db"];
const weights = table as Record<string, IngredientInfo>;
/** priceCache key prefix used by prices.ts. */
const PRICE_VERSION = "v4:";

export type RecipeCost = { perServe: number; priced: number; of: number };

/**
 * Grams per ml for an ingredient from the table (its grams per tablespoon, teaspoon or cup;
 * the table uses Australian 20 ml tablespoons). Null when the table doesn't know it.
 */
export function densityFromTable(name: string): number | null {
  const g = weights[name.toLowerCase().trim()]?.g;
  if (!g) return null;
  const density = g.ml ?? (g.tbsp != null ? g.tbsp / 20 : g.tsp != null ? g.tsp / 5 : g.cup != null ? g.cup / 250 : null);
  return density != null && density > 0 && density < 3 ? Math.round(density * 1000) / 1000 : null;
}

/** Best buy per ingredient name (from cached price comparisons), rebuilt when the cache changes. */
let index: { stamp: string; offers: Map<string, Offer> } | null = null;
function priceIndex(db: DB): Map<string, Offer> {
  const stamp = db
    .select({ n: sql<number>`count(*)`, last: sql<number>`max(${priceCache.fetchedAt})` })
    .from(priceCache)
    .get();
  const key = `${stamp?.n}:${stamp?.last}`;
  if (index?.stamp === key) return index.offers;
  const offers = new Map<string, Offer>();
  for (const row of db.select().from(priceCache).orderBy(desc(priceCache.fetchedAt)).all()) {
    if (!row.term.startsWith(PRICE_VERSION)) continue;
    const best = (row.data as PriceComparison).cheapest;
    if (best) offers.set(row.term.slice(PRICE_VERSION.length), best);
  }
  index = { stamp: key, offers };
  costs = null;
  return offers;
}

/**
 * What one ingredient line costs, pro rata (what you use, not the whole pack):
 * grams × price per kg, or count × price each. Null when it can't be worked out.
 */
function lineCost(recipe: StoreRecipe, i: StoreRecipe["ingredients"][number], offer: Offer): number | null {
  if (offer.unitPrice == null || !offer.unitBasis) return null;
  const unit = normalizeUnit(i.unit) ?? "count";
  const qty = i.qty ?? 1;
  if (offer.unitBasis === "each") return unit === "count" ? qty * offer.unitPrice : null;
  const info = weights[i.name.toLowerCase().trim()];
  const per = info ? gramsPerUnit(info, unit, isMealKit(recipe.slug)) : unit === "g" || unit === "ml" ? 1 : unit === "kg" || unit === "l" ? 1000 : undefined;
  if (per == null) return null;
  return ((qty * per) / 1000) * offer.unitPrice;
}

/** Cost per serve of a meal from cached prices; pantry staples and optional extras are left out. */
export function recipeCost(recipe: StoreRecipe, offers: Map<string, Offer>): RecipeCost | null {
  const lines = recipe.ingredients.filter((i) => !i.pantry && !i.optional && !i.blendSlug);
  if (lines.length === 0) return null;
  let total = 0;
  let priced = 0;
  for (const i of lines) {
    const offer = offers.get(searchKey(i.name));
    const cost = offer ? lineCost(recipe, i, offer) : null;
    if (cost != null && Number.isFinite(cost)) {
      total += cost;
      priced++;
    }
  }
  // Only claim a cost when most of the shopping is priced; scale up for the rest.
  if (priced < Math.max(2, lines.length * 0.6)) return null;
  const estimate = (total / priced) * lines.length;
  return { perServe: Math.round((estimate / recipe.servings) * 100) / 100, priced, of: lines.length };
}

let costs: Map<string, RecipeCost | null> | null = null;
/** Costs for every meal, cached until prices change. */
export function allRecipeCosts(db: DB, store: ContentStore): Map<string, RecipeCost | null> {
  const offers = priceIndex(db);
  if (!costs) costs = new Map(store.recipes.filter((r) => r.kind === "meal").map((r) => [r.slug, recipeCost(r, offers)]));
  return costs;
}

/** Ingredient names worth pricing (for the background refresh), most used first. */
export function ingredientsToPrice(store: ContentStore): string[] {
  const counts = new Map<string, number>();
  for (const r of store.recipes) {
    if (r.kind !== "meal") continue;
    for (const i of r.ingredients) if (!i.pantry && !i.optional && !i.blendSlug) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

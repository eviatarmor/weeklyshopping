import { eq } from "drizzle-orm";
import { normalizeName } from "@/shared/normalize";
import type { Context } from "./trpc";
import { recipeCooked, recipeIngredients, recipeRatings, recipes } from "./db/schema";

type DB = Context["db"];
type Vector = Map<string, number>;

/** Tags that say where a recipe came from rather than what it is. */
const IGNORED_TAGS = new Set(["hellofresh", "everyplate", "mealime", "vegetarian", "blend", "reddit", "quick", "easy"]);
const STOPWORDS = new Set([
  "with", "and", "the", "for", "from", "style", "easy", "quick", "dinner", "lunch", "inspired", "version", "classic",
  "homemade", "simple", "speedy", "super", "loaded", "hearty", "cheesy", "creamy", "crispy", "spicy", "sweet",
]);

type Index = { titles: Map<string, string>; vectors: Map<string, Vector> };
let cache: { key: string; index: Index } | null = null;

/** TF-IDF feature vectors (tags, main ingredients, blends, title words) for every meal, cached per content version. */
function buildIndex(db: DB, contentVersion: string): Index {
  if (cache?.key === contentVersion) return cache.index;
  const meals = db.select({ slug: recipes.slug, title: recipes.title, tags: recipes.tags }).from(recipes).where(eq(recipes.kind, "meal")).all();
  const features = new Map<string, Set<string>>();
  for (const m of meals) {
    const f = new Set<string>();
    for (const t of m.tags) if (!IGNORED_TAGS.has(t)) f.add(`tag:${t}`);
    for (const w of normalizeName(m.title).split(" ")) if (w.length >= 4 && !STOPWORDS.has(w)) f.add(`word:${w}`);
    features.set(m.slug, f);
  }
  const ingredients = db
    .select({ recipeSlug: recipeIngredients.recipeSlug, productSlug: recipeIngredients.productSlug, blendSlug: recipeIngredients.blendSlug, pantry: recipeIngredients.pantry })
    .from(recipeIngredients)
    .all();
  for (const i of ingredients) {
    const f = features.get(i.recipeSlug);
    if (!f || i.pantry) continue;
    if (i.productSlug) f.add(`product:${i.productSlug}`);
    if (i.blendSlug) f.add(`blend:${i.blendSlug}`);
  }

  const df = new Map<string, number>();
  for (const f of features.values()) for (const key of f) df.set(key, (df.get(key) ?? 0) + 1);
  const n = features.size;
  const vectors = new Map<string, Vector>();
  for (const [slug, f] of features) {
    const v: Vector = new Map();
    let norm = 0;
    for (const key of f) {
      // Ignore features shared by almost everything (e.g. onion, garlic) or by a single recipe.
      const d = df.get(key) ?? 1;
      if (d < 2 || d > n * 0.4) continue;
      const weight = Math.log(n / d);
      v.set(key, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [key, weight] of v) v.set(key, weight / norm);
    vectors.set(slug, v);
  }
  const index = { titles: new Map(meals.map((m) => [m.slug, m.title])), vectors };
  cache = { key: contentVersion, index };
  return index;
}

function dot(a: Vector, b: Vector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [key, weight] of small) sum += weight * (large.get(key) ?? 0);
  return sum;
}

export type Recommendation = { slug: string; score: number; because: string | null };

/**
 * Content-based recommendations. A taste profile is built from the user's ratings
 * (5★ = +2 … 1★ = −2) plus a small boost for meals they've cooked; unrated,
 * uncooked meals are ranked by similarity to it. Falls back to the whole
 * household's ratings when this user hasn't rated anything yet.
 */
export function recommend(db: DB, contentVersion: string, userEmail: string, limit: number): { basedOn: number; items: Recommendation[] } {
  const index = buildIndex(db, contentVersion);
  const allRatings = db.select().from(recipeRatings).all();
  const mine = allRatings.filter((r) => r.userEmail === userEmail);
  const ratings = mine.length ? mine : allRatings;
  const cooked = db.select({ slug: recipeCooked.recipeSlug }).from(recipeCooked).all();

  const weights = new Map<string, number>();
  for (const r of ratings) weights.set(r.recipeSlug, (weights.get(r.recipeSlug) ?? 0) + (r.stars - 3));
  for (const c of cooked) weights.set(c.slug, (weights.get(c.slug) ?? 0) + 0.5);

  const profile: Vector = new Map();
  for (const [slug, w] of weights) {
    const v = index.vectors.get(slug);
    if (!v || w === 0) continue;
    for (const [key, value] of v) profile.set(key, (profile.get(key) ?? 0) + w * value);
  }
  const liked = [...weights.entries()].filter(([slug, w]) => w > 0 && index.vectors.has(slug)).map(([slug]) => slug);
  if (liked.length === 0) return { basedOn: 0, items: [] };

  const seen = new Set([...ratings.map((r) => r.recipeSlug), ...cooked.map((c) => c.slug)]);
  const scored: { slug: string; score: number }[] = [];
  for (const [slug, v] of index.vectors) {
    if (seen.has(slug)) continue;
    const score = dot(profile, v);
    if (score > 0) scored.push({ slug, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // Explain each pick with the liked meal it's closest to, and keep the list varied.
  const perReason = new Map<string, number>();
  const items: Recommendation[] = [];
  for (const { slug, score } of scored) {
    const v = index.vectors.get(slug)!;
    let best: string | null = null;
    let bestSim = 0;
    for (const l of liked) {
      const sim = dot(index.vectors.get(l)!, v);
      if (sim > bestSim) [best, bestSim] = [l, sim];
    }
    const count = best ? (perReason.get(best) ?? 0) : 0;
    if (best && count >= Math.max(3, Math.ceil(limit / liked.length))) continue;
    if (best) perReason.set(best, count + 1);
    items.push({ slug, score, because: best ? (index.titles.get(best) ?? null) : null });
    if (items.length >= limit) break;
  }
  return { basedOn: liked.length, items };
}

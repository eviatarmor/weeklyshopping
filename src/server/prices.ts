import { eq } from "drizzle-orm";
import { isVegetarianProduct, type Offer, type PriceComparison, type Store } from "@/shared/grocery";
import { searchKey } from "@/shared/search";
import type { Context } from "./trpc";
import { priceCache, productVegetarian } from "./db/schema";
import { GROCERS } from "./grocers";

type DB = Context["db"];

/** Prices change weekly (specials start on Wednesdays); a day-old comparison is fine. */
const MAX_AGE_MS = 24 * 60 * 60_000;
/** Ingredient look-ups per store per comparison (each one is a request to the store). */
const MAX_INGREDIENT_CHECKS = 3;
const STORES: Store[] = ["woolworths", "coles"];
/** Words that describe rather than identify a product: they don't have to appear in the store's name. */
const FILLER = new Set(["fresh", "large", "small", "medium", "whole", "chopped", "sliced", "diced", "organic", "long", "loose", "leaves", "leaf", "pieces", "of", "and", "the"]);
/** Words in a store's name that say nothing about what the product is. */
const NEUTRAL = new Set([
  "woolworths", "coles", "macro", "black", "gold", "community", "co", "each", "ea", "loose", "bag", "prepack", "pack",
  "punnet", "bunch", "approx", "per", "kg", "g", "ml", "l", "fresh", "australian", "whole", "leaf", "leaves", "of", "and", "the", "with",
]);
const stemOf = (w: string) => w.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : ""));

/** How many words of the store's name aren't part of the item (fewer = closer match). */
function extraWords(item: string, product: string): number {
  const wanted = searchKey(item).split(" ").map(stemOf);
  return searchKey(product)
    .split(" ")
    .filter((w) => w && !NEUTRAL.has(w) && !/^\d/.test(w) && !wanted.some((x) => stemOf(w).startsWith(x) || x.startsWith(stemOf(w)))).length;
}

/** Words that make it a different product unless the item asks for them: onion gravy, sweet potato, spring onion, garlic bread… */
const CHANGES_PRODUCT = /\b(chips?|crisps|gravy|soup|sauce|powder|flakes|dip|rings|seasoning|stock|juice|cordial|bars?|biscuits?|noodles|snacks?|jam|spread|pickled|dried|frozen|cake|muffins?|lollies|sweet|spring|shallots?|smoked|roasted|marinated|stuffed|fried|crumbed|flavoured|paste|puree|crushed|minced|granules|salt|bread|oil|butter|vinegar|hommus|hummus|food|shampoo|wash|ground|chopped|canned|tinned|mix|blend)\b/g;

/** Does the product name mention every word of the item ("Brown Onion" → "Woolworths Brown Onions 1kg")? */
function matches(item: string, product: string): boolean {
  const words = searchKey(item).split(" ").filter((w) => w.length > 1 && !FILLER.has(w));
  if (words.length === 0) return false;
  const name = ` ${searchKey(product)} `;
  const wanted = searchKey(item);
  if ([...name.matchAll(CHANGES_PRODUCT)].some(([word]) => !wanted.includes(stemOf(word)))) return false;
  return words.every((w) => {
    const stem = stemOf(w);
    return name.includes(` ${w}`) || (stem.length > 2 && name.includes(` ${stem}`));
  });
}

async function vegetarian(db: DB, offer: Offer, budget: { left: number }): Promise<boolean | null> {
  const key = `${offer.store}:${offer.productId}`;
  const known = db.select().from(productVegetarian).where(eq(productVegetarian.key, key)).get();
  if (known) return known.vegetarian;
  if (!isVegetarianProduct(offer.name, null)) return remember(db, key, false);
  if (budget.left <= 0) return null; // not checked yet: try again next time
  budget.left--;
  try {
    return remember(db, key, isVegetarianProduct(offer.name, await GROCERS[offer.store].ingredients(offer.productId)));
  } catch {
    return null;
  }
}

function remember(db: DB, key: string, value: boolean): boolean {
  db.insert(productVegetarian).values({ key, vegetarian: value, checkedAt: Date.now() }).onConflictDoUpdate({ target: productVegetarian.key, set: { vegetarian: value, checkedAt: Date.now() } }).run();
  return value;
}

/** The vegetarian matches for an item at one store, in the store's relevance order. */
async function storeMatches(db: DB, store: Store, item: string): Promise<Offer[]> {
  let results: Offer[];
  try {
    results = await GROCERS[store].search(item);
  } catch (error) {
    console.error(`price search failed (${store})`, error);
    return [];
  }
  // Keep the closest names: "Onion Brown each" over "Brown Onion & Garlic Mix".
  const matching = results.filter((o) => matches(item, o.name));
  const closest = Math.min(...matching.map((o) => extraWords(item, o.name)));
  const relevant = matching.filter((o) => extraWords(item, o.name) <= closest + 1).slice(0, 6);
  const budget = { left: MAX_INGREDIENT_CHECKS };
  const kept: Offer[] = [];
  for (const offer of relevant) if ((await vegetarian(db, offer, budget)) === true) kept.push(offer);
  return kept;
}

async function compare(db: DB, item: string): Promise<PriceComparison> {
  const perStore = await Promise.all(STORES.map((s) => storeMatches(db, s, item)));
  const all = perStore.flat();
  const byPrice = (a: Offer, b: Offer) => a.price - b.price;
  // Compare unit prices on the basis most products use (per kg, per litre or each).
  const bases = new Map<string, number>();
  for (const o of all) if (o.unitBasis) bases.set(o.unitBasis, (bases.get(o.unitBasis) ?? 0) + 1);
  const basis = [...bases].sort((a, b) => b[1] - a[1])[0]?.[0];
  const withUnit = all.filter((o) => o.unitBasis === basis && o.unitPrice != null);
  return {
    cheapest: [...all].sort(byPrice)[0] ?? null,
    bestValue: withUnit.sort((a, b) => a.unitPrice! - b.unitPrice!)[0] ?? null,
    offers: perStore.flatMap((list) => [...list].sort(byPrice).slice(0, 1)),
    fetchedAt: Date.now(),
  };
}

/** Cached comparison for a list item, refreshed when older than a day. */
export async function priceFor(db: DB, name: string): Promise<PriceComparison> {
  // Versioned so results from an earlier store line-up (with IGA) aren't reused.
  const term = `v2:${searchKey(name)}`;
  const cached = db.select().from(priceCache).where(eq(priceCache.term, term)).get();
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached.data;
  const data = await compare(db, name);
  // Don't cache a total failure (e.g. a store hiccup): try again next time.
  if (data.offers.length) {
    db.insert(priceCache).values({ term, data, fetchedAt: data.fetchedAt }).onConflictDoUpdate({ target: priceCache.term, set: { data, fetchedAt: data.fetchedAt } }).run();
  }
  return data;
}


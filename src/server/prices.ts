import { eq } from "drizzle-orm";
import { isVegetarianProduct, pickBestBuy, type Offer, type PriceComparison, type Store } from "@/shared/grocery";
import { extraWords, matches } from "@/shared/product-match";
import { searchKey } from "@/shared/search";
import type { Context } from "./trpc";
import { priceCache, productVegetarian } from "./db/schema";
import { GROCERS } from "./grocers";

type DB = Context["db"];

/** Prices change weekly (specials start on Wednesdays); a day-old comparison is fine. */
const MAX_AGE_MS = 24 * 60 * 60_000;
/** How long to keep a comparison where one store couldn't be reached. */
const PARTIAL_AGE_MS = 20 * 60_000;
/** Ingredient look-ups per store per comparison (each one is a request to the store). */
const MAX_INGREDIENT_CHECKS = 3;
const STORES: Store[] = ["woolworths", "coles"];
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
/** The vegetarian matches for an item at one store; `ok` is false when the store couldn't be reached. */
async function storeMatches(db: DB, store: Store, item: string): Promise<{ offers: Offer[]; ok: boolean }> {
  let results: Offer[];
  try {
    results = await GROCERS[store].search(item);
  } catch (error) {
    console.error(`price search failed (${store})`, error);
    return { offers: [], ok: false };
  }
  // Keep the closest names: "Onion Brown each" over "Brown Onion & Garlic Mix".
  const matching = results.filter((o) => matches(item, o.name));
  const closest = Math.min(...matching.map((o) => extraWords(item, o.name)));
  const relevant = matching.filter((o) => extraWords(item, o.name) <= closest + 1).slice(0, 6);
  const budget = { left: MAX_INGREDIENT_CHECKS };
  const kept: Offer[] = [];
  let unchecked = false;
  for (const offer of relevant) {
    const verdict = await vegetarian(db, offer, budget);
    if (verdict === true) kept.push(offer);
    else if (verdict === null) unchecked = true;
  }
  // Nothing confirmed yet but some couldn't be checked: treat like a hiccup so it's retried soon.
  return { offers: kept, ok: kept.length > 0 || !unchecked };
}

async function compare(db: DB, item: string): Promise<{ data: PriceComparison; complete: boolean }> {
  const results = await Promise.all(STORES.map((s) => storeMatches(db, s, item)));
  const perStore = results.map((r) => r.offers);
  const all = perStore.flat();
  const byPrice = (a: Offer, b: Offer) => a.price - b.price;
  // Compare unit prices on the basis most products use (per kg, per litre or each).
  const bases = new Map<string, number>();
  for (const o of all) if (o.unitBasis) bases.set(o.unitBasis, (bases.get(o.unitBasis) ?? 0) + 1);
  const basis = [...bases].sort((a, b) => b[1] - a[1])[0]?.[0];
  const withUnit = all.filter((o) => o.unitBasis === basis && o.unitPrice != null);
  const picks = perStore.flatMap((list) => pickBestBuy(list) ?? []);
  return {
    data: {
      // The best buy at each store, then the better of those two.
      cheapest: pickBestBuy(picks),
      bestValue: withUnit.sort((a, b) => a.unitPrice! - b.unitPrice! || byPrice(a, b))[0] ?? null,
      offers: picks,
      fetchedAt: Date.now(),
    },
    complete: results.every((r) => r.ok),
  };
}

/** Cached comparison for a list item, refreshed when older than a day. */
export async function priceFor(db: DB, name: string): Promise<PriceComparison> {
  // Versioned so results from earlier versions (IGA, or Coles hiccups) aren't reused.
  const term = `v4:${searchKey(name)}`;
  const cached = db.select().from(priceCache).where(eq(priceCache.term, term)).get();
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached.data;
  const { data, complete } = await compare(db, name);
  if (data.offers.length) {
    // Both stores answered: keep it for a day. One store had a hiccup: keep it for 20 minutes, then retry.
    const fetchedAt = complete ? data.fetchedAt : data.fetchedAt - MAX_AGE_MS + PARTIAL_AGE_MS;
    db.insert(priceCache).values({ term, data, fetchedAt }).onConflictDoUpdate({ target: priceCache.term, set: { data, fetchedAt } }).run();
  }
  return data;
}


/** Ingredient prices older than this are refreshed in the background (for recipe costs). */
const BACKGROUND_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Price one ingredient that has no recent price (most used first), for recipe costs.
 * Returns false when everything is fresh. Called from the Durable Object alarm, a few a minute at most.
 */
export async function refreshOneIngredientPrice(db: DB, names: string[]): Promise<boolean> {
  const fetched = new Map(db.select({ term: priceCache.term, at: priceCache.fetchedAt }).from(priceCache).all().map((r) => [r.term, r.at]));
  const stale = names.find((name) => {
    const at = fetched.get(`v4:${searchKey(name)}`);
    return at == null || Date.now() - at > BACKGROUND_MAX_AGE_MS;
  });
  if (!stale) return false;
  const term = `v4:${searchKey(stale)}`;
  const { data, complete } = await compare(db, stale);
  // Remember even "no match" so the same ingredient isn't retried every few minutes.
  const fetchedAt = complete || data.offers.length ? data.fetchedAt : data.fetchedAt - BACKGROUND_MAX_AGE_MS + PARTIAL_AGE_MS;
  db.insert(priceCache).values({ term, data, fetchedAt }).onConflictDoUpdate({ target: priceCache.term, set: { data, fetchedAt } }).run();
  return true;
}

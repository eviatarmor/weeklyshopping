/** Supermarket price comparison: shared types and the vegetarian ingredient check. */

export type Store = "woolworths" | "coles";

export const STORE_LABELS: Record<Store, string> = { woolworths: "Woolworths", coles: "Coles" };

export type Offer = {
  store: Store;
  productId: string;
  name: string;
  /** Pack size as the store shows it ("500g", "6 pack"). */
  size: string | null;
  price: number;
  wasPrice: number | null;
  /** Normalised unit price: dollars per kg, per litre or each. */
  unitPrice: number | null;
  unitBasis: "kg" | "l" | "each" | null;
  /** As the store shows it ("$0.50 / 100g"). */
  unitLabel: string | null;
  url: string;
  imageUrl: string | null;
};

export type PriceComparison = {
  /** Lowest shelf price among vegetarian matches. */
  cheapest: Offer | null;
  /** Lowest unit price (per kg, litre or each). */
  bestValue: Offer | null;
  /** The best match at each store. */
  offers: Offer[];
  fetchedAt: number;
};

const NOT_VEGETARIAN = new RegExp(
  [
    "beef", "chicken", "pork", "bacon", "\\bham\\b", "lamb", "mutton", "veal", "venison", "kangaroo", "turkey", "duck",
    "goose", "\\bmeat\\b", "poultry", "lard", "tallow", "dripping", "gelatine?", "collagen", "bone (broth|stock|marrow)",
    "\\bfish\\b", "fish sauce", "anchov", "prawn", "shrimp", "crab", "lobster", "mussel", "oyster", "scallop", "squid",
    "calamari", "octopus", "tuna", "salmon", "sardine", "mackerel", "cod\\b", "\\broe\\b", "caviar", "krill",
    // Carmine (120), gelatine (441), bone phosphate (542), shellac (904), as names or additive numbers.
    "(?<!non[- ])animal rennet", "rennet \\(animal\\)", "carmine", "cochineal", "\\be ?(120|441|542|904)\\b", "\\((120|441|542|904)\\)",
    "shellac", "isinglass", "pepsin", "chorizo", "salami", "prosciutto", "pancetta", "pepperoni", "sausage(?! roll)",
    "worcestershire",
  ].join("|"),
  "i",
);
/** Vegetarian versions of usually-meaty words. */
const VEGETARIAN_WORDS = /plant[- ]based|vegan|vegetarian|meat[- ]free|meatless|\bveggie\b|(chicken|beef)[- ]style|no meat|imitation/i;

/** Drop allergen advice ("may contain fish", "made on equipment that also processes…"): only real ingredients count. */
function realIngredients(text: string): string {
  return text
    .replace(/(may (also )?contain|may be present|traces? of|manufactured|made|produced|processed|packed)[^.]*?(\.|$)/gi, " ")
    .replace(/allergen[^.]*\./gi, " ");
}

/**
 * True when nothing in the product name or ingredients is meat, fish or another animal-slaughter
 * product. Dairy and eggs are fine; "may contain" warnings are ignored.
 */
export function isVegetarianProduct(name: string, ingredients: string | null): boolean {
  if (NOT_VEGETARIAN.test(name) && !VEGETARIAN_WORDS.test(name)) return false;
  if (!ingredients) return true;
  const text = realIngredients(ingredients);
  // Ignore plant-based mentions like "chicken style flavour" before checking.
  const cleaned = text.replace(/(chicken|beef)[- ]style/gi, "").replace(/plant[- ]based \w+/gi, "");
  return !NOT_VEGETARIAN.test(cleaned);
}

/** A bigger pack is worth it when it costs at most this many times the cheapest option… */
const BIGGER_PACK_FACTOR = 2.5;
/** …and at most this many dollars more. */
const BIGGER_PACK_EXTRA = 5;

/**
 * The sensible buy among similar products: the lowest price per kg / litre / each, as long as the
 * pack doesn't cost much more than the cheapest one. A 500 g jar of tomato paste at $1.40
 * ($0.28/100 g) beats a 170 g tin at $0.95 ($0.56/100 g), but a 2 kg bag of onions doesn't beat
 * a single onion.
 */
export function pickBestBuy(offers: Offer[]): Offer | null {
  if (offers.length === 0) return null;
  const cheapest = offers.reduce((a, b) => (b.price < a.price ? b : a));
  const affordable = offers.filter((o) => o.price <= cheapest.price * BIGGER_PACK_FACTOR && o.price - cheapest.price <= BIGGER_PACK_EXTRA);
  // Unit prices are only comparable on the same basis (per kg vs each).
  const counts = new Map<string, number>();
  for (const o of affordable) if (o.unitPrice != null && o.unitBasis) counts.set(o.unitBasis, (counts.get(o.unitBasis) ?? 0) + 1);
  const basis = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const comparable = affordable.filter((o) => o.unitBasis === basis && o.unitPrice != null);
  if (comparable.length < 2) return cheapest;
  return comparable.reduce((a, b) => (b.unitPrice! < a.unitPrice! || (b.unitPrice === a.unitPrice && b.price < a.price) ? b : a));
}

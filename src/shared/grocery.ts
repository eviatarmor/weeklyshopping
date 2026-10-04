/** Supermarket price comparison: shared types and the vegetarian ingredient check. */

export type Store = "woolworths" | "coles" | "iga";

export const STORE_LABELS: Record<Store, string> = { woolworths: "Woolworths", coles: "Coles", iga: "IGA" };

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

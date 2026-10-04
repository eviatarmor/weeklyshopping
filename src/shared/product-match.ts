/** Matching a shopping-list item to supermarket product names. */
import { searchKey } from "./search";

/** Words that describe rather than identify a product: they don't have to appear in the store's name. */
const FILLER = new Set(["fresh", "large", "small", "medium", "whole", "chopped", "sliced", "diced", "organic", "long", "loose", "leaves", "leaf", "pieces", "of", "and", "the"]);
/** Words in a store's name that say nothing about what the product is. */
const NEUTRAL = new Set([
  "woolworths", "coles", "macro", "black", "gold", "community", "co", "each", "ea", "loose", "bag", "prepack", "pack",
  "punnet", "bunch", "approx", "per", "kg", "g", "ml", "l", "fresh", "australian", "whole", "leaf", "leaves", "of", "and", "the", "with",
]);
const stemOf = (w: string) => w.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : ""));

/** How many words of the store's name aren't part of the item (fewer = closer match). */
export function extraWords(item: string, product: string): number {
  const wanted = searchKey(item).split(" ").map(stemOf);
  return searchKey(product)
    .split(" ")
    .filter((w) => w && !NEUTRAL.has(w) && !/^\d/.test(w) && !wanted.some((x) => stemOf(w).startsWith(x) || x.startsWith(stemOf(w)))).length;
}

/** Words that make it a different product unless the item asks for them: onion gravy, sweet potato, spring onion, garlic bread… */
const CHANGES_PRODUCT = /\b(chips?|crisps|gravy|soup|sauce|powder|flakes|dip|rings|seasoning|stock|juice|cordial|bars?|biscuits?|noodles|snacks?|jam|spread|pickled|dried|frozen|cake|muffins?|lollies|sweet|spring|shallots?|smoked|roasted|marinated|stuffed|fried|crumbed|flavoured|paste|puree|crushed|minced|granules|salt|bread|oil|butter|vinegar|hommus|hummus|food|shampoo|wash|ground|chopped|canned|tinned|mix|blend)\b/g;

/** Stores sometimes name a product with one of those words anyway ("Coles Italian Passata Sauce"). */
const ALSO_CALLED: Record<string, string[]> = {
  passata: ["sauce", "puree"],
  salsa: ["sauce", "dip"],
  pesto: ["sauce", "dip"],
  tahini: ["paste"],
  harissa: ["paste"],
  miso: ["paste"],
};

/** Does the product name mention every word of the item ("Brown Onion" → "Woolworths Brown Onions 1kg")? */
export function matches(item: string, product: string): boolean {
  const words = searchKey(item).split(" ").filter((w) => w.length > 1 && !FILLER.has(w));
  if (words.length === 0) return false;
  const name = ` ${searchKey(product)} `;
  const wanted = searchKey(item);
  const allowed = Object.entries(ALSO_CALLED).flatMap(([key, words]) => (wanted.includes(key) ? words : []));
  if ([...name.matchAll(CHANGES_PRODUCT)].some(([word]) => !wanted.includes(stemOf(word)) && !allowed.includes(word))) return false;
  return words.every((w) => {
    const stem = stemOf(w);
    return name.includes(` ${w}`) || (stem.length > 2 && name.includes(` ${stem}`));
  });
}

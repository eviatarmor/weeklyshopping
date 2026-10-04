import { FALLBACK_SECTION } from "./sections";
import { normalizeName } from "./normalize";

export type ClassifyProduct = { slug: string; name: string; aliases: string[]; sectionId: string };

/** Last-resort keyword rules, checked against the normalized name (first match wins). */
const KEYWORD_RULES: [RegExp, string][] = [
  [/\bfrozen\b|\bice cream\b|\bice block\b/, "frozen"],
  [/\b(stock|broth|peanut butter|noodle|breadcrumb)\b/, "pantry"],
  [/\b(coconut milk|coconut cream)\b/, "international"],
  [/\b(mince|steak|chicken|beef|lamb|pork|bacon|sausage|salmon|prawn|fish|fillet|thigh|breast|drumstick|chorizo|turkey|barramundi|tuna steak)\b/, "meat-seafood"],
  [/\b(milk|yoghurt|yogurt|cheese|butter|cream|egg|feta|parmesan|mozzarella|haloumi|halloumi|ricotta)\b/, "dairy-eggs"],
  [/\b(bread|roll|bun|wrap|tortilla|bagel|croissant|sourdough|pita|naan|brioche)\b/, "bakery"],
  [/\b(spice|seasoning|blend|cumin|paprika|oregano|cinnamon|turmeric|chilli flake|pepper corn|peppercorn|thyme|rosemary dried|stock cube)\b/, "herbs-spices"],
  [/\b(soy|teriyaki|kecap|miso|curry paste|sriracha|hoisin|sweet chilli|fish sauce|coconut milk|rice paper|nori)\b/, "international"],
  [/\b(chip|crisp|chocolate|biscuit|lolly|cracker|popcorn|muesli bar|nut bar)\b/, "snacks"],
  [/\b(juice|soft drink|water|coffee|tea|cola|kombucha|soda|beer|wine)\b/, "drinks"],
  [/\b(toilet|paper towel|detergent|dishwash|soap|shampoo|sponge|bin bag|foil|cling|baking paper|tissue|cleaner)\b/, "household"],
  [/\b(apple|banana|lemon|lime|orange|onion|garlic|potato|carrot|tomato|lettuce|spinach|capsicum|zucchini|cucumber|broccoli|cauliflower|mushroom|avocado|herb|coriander|parsley|basil|mint|ginger|chilli|celery|pumpkin|corn|bean|berry|grape|pear|kiwi|mango|leek|cabbage|kale|rocket|shallot|spring onion|eggplant|sweet potato|beetroot)\b/, "fruit-veg"],
  [/\b(rice|pasta|flour|sugar|oil|vinegar|sauce|stock|can|tin|lentil|chickpea|bean|noodle|oat|cereal|honey|jam|peanut butter|spread|salt|mustard|mayo|mayonnaise|ketchup|tomato paste|passata|breadcrumb|couscous|quinoa)\b/, "pantry"],
];

export type ClassifyInput = {
  name: string;
  /** normalizedName → sectionId learned from this household. */
  historySections: Map<string, string>;
  /** normalizedName (name + aliases) → product. */
  productIndex: Map<string, ClassifyProduct>;
};

export type Classification = { sectionId: string; productSlug: string | null; source: "history" | "catalog" | "keyword" | "fallback" };

export function buildProductIndex(products: ClassifyProduct[]): Map<string, ClassifyProduct> {
  const index = new Map<string, ClassifyProduct>();
  for (const p of products) {
    for (const n of [p.name, ...p.aliases]) {
      const key = normalizeName(n);
      if (!index.has(key)) index.set(key, p);
    }
  }
  return index;
}

export function classify({ name, historySections, productIndex }: ClassifyInput): Classification {
  const key = normalizeName(name);
  const product = productIndex.get(key) ?? null;
  const learned = historySections.get(key);
  if (learned) return { sectionId: learned, productSlug: product?.slug ?? null, source: "history" };
  if (product) return { sectionId: product.sectionId, productSlug: product.slug, source: "catalog" };
  for (const [pattern, sectionId] of KEYWORD_RULES) {
    if (pattern.test(key)) return { sectionId, productSlug: null, source: "keyword" };
  }
  return { sectionId: FALLBACK_SECTION, productSlug: null, source: "fallback" };
}

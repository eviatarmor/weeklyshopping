import { normalizeName } from "./normalize";
import { roundQty } from "./units";

export type MeasureSystem = "spoons" | "grams";
export type SpoonStandard = "au" | "us";

/** Millilitres per volume unit. Australian tablespoons are 20 ml and cups 250 ml; US ones 15 ml and 240 ml. */
const VOLUME_ML: Record<SpoonStandard, Record<string, number>> = {
  au: { tsp: 5, tbsp: 20, cup: 250, ml: 1, l: 1000, pinch: 0.3 },
  us: { tsp: 4.93, tbsp: 14.79, cup: 240, ml: 1, l: 1000, pinch: 0.3 },
};

/**
 * Approximate density (g per ml), matched against the normalized ingredient name.
 * First match wins, so specific entries come before generic ones.
 */
const DENSITY: [RegExp, number][] = [
  [/\b(water|stock|broth|vinegar|wine|juice|lemon juice|lime juice)\b/, 1],
  [/\b(soy sauce|kecap manis|fish sauce|tamari|worcestershire)\b/, 1.15],
  [/\b(honey|golden syrup|treacle)\b/, 1.42],
  [/\b(maple syrup|agave|rice malt syrup)\b/, 1.32],
  [/\b(oil|ghee)\b/, 0.92],
  [/\bbutter\b(?! bean)/, 0.96],
  [/\b(milk|buttermilk)\b/, 1.03],
  [/\b(cream|sour cream|creme fraiche|mascarpone)\b/, 1],
  [/\b(yoghurt|yogurt)\b/, 1.05],
  [/\b(peanut butter|tahini|nut butter)\b/, 1.05],
  [/\b(tomato paste|tomato puree|curry paste|miso|pesto)\b/, 1.1],
  [/\b(mayonnaise|mayo|aioli)\b/, 0.95],
  [/\bicing sugar\b/, 0.5],
  [/\bbrown sugar\b/, 0.9],
  [/\bsugar\b/, 0.85],
  [/\bsalt\b/, 1.2],
  [/\b(baking powder|bicarb|baking soda)\b/, 0.9],
  [/\b(cornflour|cornstarch|plain flour|self raising flour|flour)\b/, 0.55],
  [/\b(cocoa)\b/, 0.45],
  [/\b(rice|arborio)\b/, 0.85],
  [/\b(quinoa|couscous|lentil|split pea|polenta)\b/, 0.8],
  [/\b(oat|rolled oat)\b/, 0.4],
  [/\b(panko|breadcrumb)\b/, 0.25],
  [/\b(parmesan|pecorino|grated cheese)\b/, 0.4],
  [/\b(shredded cheese|cheddar|mozzarella|feta)\b/, 0.45],
  [/\b(almond|cashew|walnut|pecan|peanut|pistachio|pine nut|hazelnut|nut)\b/, 0.6],
  [/\b(sesame|pepita|sunflower seed|chia|flax|poppy seed)\b/, 0.6],
  [/\b(desiccated coconut|shredded coconut|coconut flake)\b/, 0.35],
  [/\b(oregano|basil|thyme|parsley|rosemary|mint|dill|sage|marjoram|tarragon|chive|italian herb|mixed herb|bay lea)\b/, 0.25],
  [/\b(chilli flake|red pepper flake|onion flake)\b/, 0.4],
  [/\b(stock powder|stock cube|bouillon)\b/, 0.6],
  [/\b(garlic powder|garlic granule|minced garlic)\b/, 0.6],
  [/\b(seasoning|spice|blend|powder|ground|paprika|cumin|coriander|turmeric|cinnamon|nutmeg|cardamom|allspice|clove|ginger|masala|curry|pepper|cayenne|sumac|za ?atar|fenugreek|fennel|caraway|mustard seed|five spice)\b/, 0.5],
];

export function densityFor(name: string): number | null {
  const key = normalizeName(name);
  for (const [pattern, density] of DENSITY) if (pattern.test(key)) return density;
  return null;
}

export type Measured = { qty: number | null; unit: string | null; approximate: boolean };

/**
 * Express a quantity in the chosen system. In "grams" mode, spoon/cup/ml amounts
 * become grams when the ingredient's density is known; everything else is left alone.
 */
export function measure(
  qty: number | null,
  unit: string | null,
  name: string,
  system: MeasureSystem,
  standard: SpoonStandard = "au",
): Measured {
  if (system === "spoons" || qty == null || !unit) return { qty, unit, approximate: false };
  const ml = VOLUME_ML[standard][unit];
  if (ml == null) return { qty, unit, approximate: false };
  const density = densityFor(name);
  if (density == null) return { qty, unit, approximate: false };
  const grams = qty * ml * density;
  if (grams >= 1000) return { qty: roundQty(grams / 1000, "kg"), unit: "kg", approximate: true };
  // Small amounts keep a decimal so ¼ tsp of chilli doesn't round to 0 g.
  const rounded = grams < 10 ? Math.round(grams * 10) / 10 : roundQty(grams, "g");
  return { qty: rounded, unit: "g", approximate: true };
}

/** Which spoon standard a recipe's source uses. */
export function spoonStandardFor(sourceUrl: string | null | undefined): SpoonStandard {
  return sourceUrl && /mealime\.com/.test(sourceUrl) ? "us" : "au";
}

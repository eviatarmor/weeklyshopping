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
// Names are normalized first, so plurals are singular ("olives" → "olive") except a
// few words kept as-is ("lentils", "chickpeas", "peas", "oats"); patterns allow both.
const DENSITY: [RegExp, number][] = [
  [/\b(water|stock|broth|vinegar|wine|juice|lemon juice|lime juice|beer|brandy|vodka|arak|rosewater|mirin)\b/, 1],
  [/\b(soy sauce|kecap mani|kecap manis|fish sauce|tamari|worcestershire)\b/, 1.15],
  // Syrups before fruit, so "date syrup" isn't weighed like dates.
  [/\b(honey|golden syrup|treacle|date syrup|silan|molasses)\b/, 1.42],
  [/\b(maple syrup|agave|rice malt syrup)\b/, 1.32],
  // Sauces, pastes and spreads before the vegetables and spices they're made from.
  [/\b(hummus|houmous|guacamole|tzatziki|dip|babaganoush|salsa)\b/, 1],
  [/\b(dressing|vinaigrette|ranch)\b/, 0.98],
  [/\b(peanut butter|tahini|nut butter)\b/, 1.05],
  [/\b(sauce|ketchup|relish|chutney|mustard(?! (powder|seed))|harissa|paste|puree|jam|glaze|spread|tapenade|shatta|gochujang|sambal|adobo|miso|pesto)\b/, 1.1],
  [/\b(mayonnaise|mayo|aioli)\b/, 0.95],
  [/\b(crushed tomato|diced tomato|chopped tomato|passata)\b/, 1.03],
  // Frozen and loose veg/fruit measured by the cup.
  [/\b(snow pea|sugar snap)\w*\b/, 0.3],
  [/\b(edamame|frozen pea|peas|green pea|corn|corn kernel|mixed vegetable|frozen vegetable|butternut squash|pumpkin piece|broad bean|fava bean)\b/, 0.6],
  [/\b(blueberr|blueberry|berry|cherry|cherries|mango|raspberr|strawberr|grape|pomegranate seed)\w*\b/, 0.6],
  [/\b(sun dried tomato|semi dried tomato)\b/, 0.45],
  [/\b(olive(?! oil)|caper|sauerkraut|kimchi|pickle|pickled|gherkin)\b/, 0.6],
  [/\b(granola|muesli)\b/, 0.45],
  [/\b(dried porcini|dried mushroom|porcini)\b/, 0.3],
  [/\b(cabbage|kale|slaw|coleslaw|cavolo nero|silverbeet|chard)\b/, 0.3],
  [/\b(broccoli|cauliflower|floret)\w*\b/, 0.35],
  [/\b(baby spinach|spinach|rocket|lettuce|salad lea\w*|mixed lea\w*|greens|watercress|herb lea\w*|coriander lea\w*|basil lea\w*|mint lea\w*)\b/, 0.12],
  [/\bsprout\w*\b/, 0.4],
  [/\b(nutritional yeast)\b/, 0.25],
  [/\bdried cranberr\w*|\b(cranberr\w*|raisin|sultana|currant|dried apricot|dried fruit)\b/, 0.5],
  [/\b(date)\b/, 0.65],
  [/\b(cottage cheese|ricotta|cream cheese|quark|goat s curd|labneh)\b/, 1],
  [/\b(pearl barley|barley|freekeh|bulgur|risoni|orzo|millet|buckwheat|semolina)\b/, 0.85],
  [/\b(oil|ghee)\b/, 0.92],
  [/\bbutter\b(?! bean)/, 0.96],
  [/\b(milk|buttermilk)\b/, 1.03],
  [/\b(cream|sour cream|creme fraiche|mascarpone)\b/, 1],
  [/\b(yoghurt|yogurt)\b/, 1.05],
  [/\bicing sugar\b/, 0.5],
  [/\bbrown sugar\b/, 0.9],
  [/\bsugar\b/, 0.85],
  [/\bsalt\b/, 1.2],
  [/\b(baking powder|bicarb|bicarbonate|baking soda)\b/, 0.9],
  [/\b(cornflour|cornstarch|plain flour|self raising flour|flour|cornmeal)\b/, 0.55],
  [/\b(cocoa)\b/, 0.45],
  [/\b(rice|arborio)\b/, 0.85],
  [/\b(cooked (chickpea|bean|lentil)\w*|tinned (chickpea|bean)\w*)\b/, 0.65],
  [/\b(quinoa|couscous|lentils?|split peas?|polenta|chickpeas?|mung bean\w*|dried bean\w*)\b/, 0.8],
  [/\b(oats?|rolled oats?)\b/, 0.4],
  [/\b(panko|breadcrumb)\b/, 0.25],
  [/\b(parmesan|pecorino|grana padano|grated cheese)\b/, 0.4],
  [/\b(shredded cheese|cheddar|mozzarella|feta|gruyere|kashkaval|cheese)\b/, 0.45],
  [/\b(flaked|sliced|slivered) almond\w*\b|\balmond\w*\b.*\b(flaked|sliced|slivered)\b/, 0.35],
  [/\bground (flax|linseed|almond)\w*\b|\balmond meal\b/, 0.4],
  [/\b(almond|cashew|walnut|pecan|peanut|pistachio|pine nut|hazelnut|nut)\b/, 0.6],
  [/\b(sesame|pepita|pumpkin seed|sunflower seed|chia|flax|flaxseed|poppy seed|hemp seed|basil seed)\b/, 0.6],
  [/\b(desiccated coconut|shredded coconut|coconut flake|coconut)\b(?! (milk|cream|oil|water|yoghurt|yogurt))/, 0.35],
  // Herbs: dried ones are light; fresh chopped leaves even lighter.
  [/\bdried\b.*\b(oregano|basil|thyme|parsley|rosemary|mint|dill|sage|marjoram|tarragon|chive|herb|za ?atar|lavender|rose petal)/, 0.25],
  // Fresh leaves (not ground or seeds): parsley and chives pack denser than coriander, mint or basil.
  [/^(?!.*\b(ground|seeds?|powder)\b).*\b(parsley|chive)\b/, 0.22],
  [/^(?!.*\b(ground|seeds?|powder)\b).*\b(coriander|mint|basil|dill|fresh herb|mixed fresh herb|herbs)\b/, 0.1],
  [/\bfresh\b.*\b(oregano|thyme|rosemary|sage|marjoram|tarragon|za ?atar)\b/, 0.15],
  [/\b(oregano|thyme|rosemary|sage|marjoram|tarragon|italian herb|mixed herb|dried herb|bay lea)\b/, 0.25],
  [/\b(chilli flake|red pepper flake|onion flake)\b/, 0.4],
  [/\b(stock powder|stock cube|bouillon)\b/, 0.6],
  [/\b(garlic powder|garlic granule|minced garlic)\b/, 0.6],
  [/\b(fresh ginger|grated ginger|ginger root)\b/, 0.4],
  [/\b(seasoning|spice|blend|powder|ground|paprika|cumin|coriander|turmeric|cinnamon|nutmeg|cardamom|allspice|clove|ginger|masala|curry|pepper|peppercorn|cayenne|sumac|za ?atar|fenugreek|fennel|caraway|mustard seed|five spice|baharat|ras el hanout|quatre epice)\w*\b/, 0.42],
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
  /** Grams per ml from the ingredient table, used when the name isn't one of the patterns above. */
  fallbackDensity: number | null = null,
): Measured {
  if (system === "spoons" || qty == null || !unit) return { qty, unit, approximate: false };
  const ml = VOLUME_ML[standard][unit];
  if (ml == null) return { qty, unit, approximate: false };
  const density = densityFor(name) ?? fallbackDensity;
  if (density == null) return { qty, unit, approximate: false };
  const grams = qty * ml * density;
  if (grams >= 1000) return { qty: roundQty(grams / 1000, "kg"), unit: "kg", approximate: true };
  // Small amounts keep a decimal so ¼ tsp of chilli doesn't round to 0 g.
  const rounded = grams < 10 ? Math.round(grams * 10) / 10 : roundQty(grams, "g");
  return { qty: rounded, unit: "g", approximate: true };
}

const KJ_PER_KCAL = 4.184;

/**
 * Some sources (older HelloFresh recipes especially) publish kilojoules in the
 * "Calories" field. Check the figure against the macros (4/4/9 kcal per gram of
 * protein/carbs/fat): if it's about 4.2× too high, it's really kJ. Without
 * macros, anything above 1,800 kcal for a single serving is assumed to be kJ.
 */
export function correctedKcal(kcal: number, macros: { proteinG?: number; carbsG?: number; fatG?: number } = {}): number {
  const { proteinG, carbsG, fatG } = macros;
  if (proteinG != null && carbsG != null && fatG != null) {
    const fromMacros = 4 * proteinG + 4 * carbsG + 9 * fatG;
    if (fromMacros > 0 && kcal / fromMacros > 2.5) return Math.round(kcal / KJ_PER_KCAL);
    return kcal;
  }
  return kcal > 1800 ? Math.round(kcal / KJ_PER_KCAL) : kcal;
}

/** Which spoon standard a recipe's source uses (Israeli cups and spoons match the US ones). */
export function spoonStandardFor(sourceUrl: string | null | undefined): SpoonStandard {
  return sourceUrl && /mealime\.com|hashulchan\.co\.il/.test(sourceUrl) ? "us" : "au";
}

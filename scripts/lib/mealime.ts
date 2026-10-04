/**
 * Mealime recipes. Each recipe has diet "variants"; the page for a variant embeds
 * a structured `publishedRecipe` in __NEXT_DATA__ (US units, converted to metric here).
 */
import type { RecipeContent } from "../../src/shared/content.ts";
import { parseIngredient } from "../../src/shared/parse-ingredient.ts";
import { roundQty } from "../../src/shared/units.ts";
import { PANTRY_NAMES, fetchText, linkIngredient, nextData, slugify, titleCase, today, type Report } from "./common.ts";

export const MEALIME_VEGETARIAN = 2;
export const MEALIME_VEGAN = 6;

type LineItem = { quantity: string; ingredient_name: string };
type Instruction = { primary_message: string };
export type MealimeRecipe = {
  id: number;
  name: string;
  slug: string;
  serving_count: number;
  cooking_minutes?: number;
  presentation_image_url?: string;
  thumbnail_image_url?: string;
  line_items: LineItem[];
  instructions: Instruction[];
};

export async function fetchMealimeRecipe(url: string): Promise<{ recipe: MealimeRecipe; canonical: string }> {
  const pp = nextData(await fetchText(url)).props?.pageProps;
  if (!pp?.publishedRecipe) throw new Error("No publishedRecipe on page");
  return { recipe: pp.publishedRecipe, canonical: pp.canonicalVariantUrl ? new URL(pp.canonicalVariantUrl, url).toString() : url };
}

const OZ_TO_G = 28.35;
const LB_TO_G = 453.6;
const FLOZ_TO_ML = 29.57;

/** Mealime → AU naming for the most common differences. */
const AU_NAMES: [RegExp, string][] = [
  [/\bcilantro\b/gi, "coriander"],
  [/\bscallions?\b/gi, "spring onions"],
  [/\bgreen onions?\b/gi, "spring onions"],
  [/\barugula\b/gi, "rocket"],
  [/\b(red|green|yellow|orange) bell peppers?\b/gi, "$1 capsicum"],
  [/\bbell peppers?\b/gi, "capsicum"],
  [/\bgarbanzo beans\b/gi, "chickpeas"],
  [/\bcanola oil\b/gi, "vegetable oil"],
  [/\bheavy cream\b/gi, "thickened cream"],
  [/\bpowdered sugar\b/gi, "icing sugar"],
  [/\bcornstarch\b/gi, "cornflour"],
  // Vegetarian variants list the broth as "chicken or vegetable broth".
  [/\bchicken or vegetable (broth|stock)\b/gi, "vegetable $1"],
  [/\bground beef\b/gi, "beef mince"],
  [/\bpanko breadcrumbs\b/gi, "panko breadcrumbs"],
];

function auName(name: string) {
  return AU_NAMES.reduce((n, [re, to]) => n.replace(re, to), name);
}

/** "1 (15 oz) can chickpeas" → 425 g; "8 oz" → 225 g; "2 Tbsp" stays 2 tbsp. */
export function parseMealimeQuantity(quantity: string): { qty: number | null; unit: string | null; note: string | null } {
  const q = quantity.trim();
  if (!q) return { qty: null, unit: null, note: null };
  const pack = q.match(/^([\d½¼¾⅓⅔⅛ /.]+)\s*\(([\d.½¼¾]+)\s*(oz|fl oz|lb)\)\s*(.*)$/i);
  if (pack) {
    const count = parseIngredient(`${pack[1]} x`).qty ?? 1;
    const size = parseIngredient(`${pack[2]} x`).qty ?? 0;
    const unit = pack[3]!.toLowerCase();
    const total = count * size * (unit === "lb" ? LB_TO_G : unit === "fl oz" ? FLOZ_TO_ML : OZ_TO_G);
    const metricUnit = unit === "fl oz" ? "ml" : "g";
    return { qty: roundQty(total, metricUnit), unit: metricUnit, note: pack[4] ? `${pack[1]!.trim()} ${pack[4]}` : null };
  }
  const flOz = q.match(/^([\d½¼¾⅓⅔⅛ /.]+)\s*fl\.? oz$/i);
  if (flOz) return { qty: roundQty((parseIngredient(`${flOz[1]} x`).qty ?? 0) * FLOZ_TO_ML, "ml"), unit: "ml", note: null };
  const weight = q.match(/^([\d½¼¾⅓⅔⅛ /.]+)\s*(oz|lbs?)$/i);
  if (weight) {
    const n = parseIngredient(`${weight[1]} x`).qty ?? 0;
    return { qty: roundQty(n * (weight[2]!.startsWith("lb") ? LB_TO_G : OZ_TO_G), "g"), unit: "g", note: null };
  }
  const parsed = parseIngredient(`${q} x`);
  if (parsed.qty == null) return { qty: null, unit: null, note: q };
  // Leftover words like "medium" or "large" become a note.
  const rest = parsed.name.replace(/\bx$/, "").trim();
  return { qty: parsed.qty, unit: parsed.unit, note: rest || null };
}

export async function convertMealime(recipe: MealimeRecipe, sourceUrl: string, report: Report): Promise<RecipeContent> {
  const ingredients = [];
  for (const item of recipe.line_items) {
    const [base, ...prep] = item.ingredient_name.split(",");
    const name = titleCase(auName(base!.trim()));
    const { qty, unit } = parseMealimeQuantity(item.quantity);
    const pantry = !item.quantity.trim() || PANTRY_NAMES.has(base!.trim().toLowerCase());
    ingredients.push({
      name: prep.length ? `${name} (${prep.join(",").trim()})`.replace(/ \(\)$/, "") : name,
      ...(qty ? { qty } : {}),
      ...(unit ? { unit } : {}),
      ...(await linkIngredient(name, report)),
      ...(pantry ? { pantry: true } : {}),
    });
  }
  return {
    slug: `ml-${slugify(recipe.slug || recipe.name)}`,
    kind: "meal",
    title: recipe.name.replace(/"/g, "").trim(),
    sourceUrl,
    ...(recipe.presentation_image_url || recipe.thumbnail_image_url ? { imageUrl: recipe.presentation_image_url ?? recipe.thumbnail_image_url } : {}),
    servings: recipe.serving_count || 2,
    ...(recipe.cooking_minutes ? { prepMinutes: recipe.cooking_minutes } : {}),
    tags: ["mealime"],
    aliases: [],
    addedAt: today,
    ingredients,
    steps: recipe.instructions.map((s) => ({ text: s.primary_message.trim() })).filter((s) => s.text),
  };
}

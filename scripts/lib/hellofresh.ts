/**
 * HelloFresh-family recipes (HelloFresh, EveryPlate). Both brands share the same
 * recipe object, either embedded in the page's __NEXT_DATA__ or returned by the
 * public recipe search used on their archive pages.
 */
import type { RecipeContent } from "../../src/shared/content.ts";
import { correctedKcal } from "../../src/shared/measure.ts";
import { normalizeUnit } from "../../src/shared/units.ts";
import { PANTRY_NAMES, bulletLines, fetchText, hfImage, htmlToText, isoMinutes, linkIngredient, nextData, slugify, titleCase, today, type Report } from "./common.ts";

export type Brand = "hellofresh" | "everyplate";

export const BRAND_PREFIX: Record<Brand, string> = { hellofresh: "hf", everyplate: "ep" };

// Marketing/internal tags that aren't useful as filters.
const IGNORED_TAGS = new Set([
  "new", "seo", "modoz", "not suitable for coeliacs", "bestseller", "hellohero", "valentine's day", "veggie", "easy", "family friendly",
]);

type HfIngredient = { id: string; name: string; shipped?: boolean; imagePath?: string | null };
type HfYield = { yields: number; ingredients: { id: string; amount: number | null; unit: string | null }[] };
type HfStep = { instructionsMarkdown?: string; instructions?: string; images?: { path: string }[] };
export type HfRecipe = {
  name: string;
  slug?: string;
  headline?: string;
  description?: string;
  imagePath?: string;
  totalTime?: string;
  prepTime?: string;
  websiteUrl?: string;
  canonicalLink?: string;
  ingredients: HfIngredient[];
  yields: HfYield[];
  steps?: HfStep[];
  tags?: ({ name: string } | string)[];
  cuisines?: ({ name: string } | string)[];
  nutrition?: { name: string; amount: number | null; unit: string }[];
};

/** Per-serving nutrition from the HelloFresh/EveryPlate nutrition table. */
function nutritionOf(recipe: HfRecipe): RecipeContent["nutrition"] {
  const rows = recipe.nutrition ?? [];
  const find = (pattern: RegExp) => rows.find((n) => pattern.test(n.name) && n.amount != null)?.amount ?? undefined;
  const kj = rows.find((n) => n.unit === "kJ" && n.amount != null)?.amount;
  const kcal = rows.find((n) => n.unit === "kcal" && n.amount != null)?.amount ?? (kj ? Math.round(kj / 4.184) : undefined);
  if (!kcal) return undefined;
  const protein = find(/^protein$/i);
  const carbs = find(/^carbohydrate/i);
  const fat = find(/^fat$/i);
  return { kcal: correctedKcal(kcal, { proteinG: protein, carbsG: carbs, fatG: fat }), ...(protein != null ? { proteinG: protein } : {}), ...(carbs != null ? { carbsG: carbs } : {}), ...(fat != null ? { fatG: fat } : {}) };
}

export function brandOf(url: string): Brand | null {
  const host = new URL(url).hostname;
  if (host.includes("hellofresh.")) return "hellofresh";
  if (host.includes("everyplate.")) return "everyplate";
  return null;
}

export async function fetchHelloFreshRecipe(url: string): Promise<HfRecipe> {
  const recipe = nextData(await fetchText(url)).props?.pageProps?.ssrPayload?.recipe;
  if (!recipe?.ingredients) throw new Error("No recipe in __NEXT_DATA__");
  return recipe;
}

const tagName = (t: { name: string } | string) => (typeof t === "string" ? t : t.name);

export async function convertHelloFresh(recipe: HfRecipe, brand: Brand, report: Report, servings = 2): Promise<RecipeContent> {
  const chosen = recipe.yields.find((y) => y.yields === servings) ?? recipe.yields[0];
  const amounts = new Map(chosen?.ingredients.map((i) => [i.id, i]) ?? []);
  const sourceUrl = recipe.canonicalLink ?? recipe.websiteUrl;
  const baseSlug = slugify(recipe.slug ?? recipe.name).replace(/-[0-9a-f]{24}$/, "");

  const ingredients = [];
  for (const i of recipe.ingredients) {
    const amount = amounts.get(i.id);
    if (!amount) continue;
    const name = titleCase(i.name.replace(/\([^)]*\)/g, "").trim());
    const unit = normalizeUnit(amount.unit);
    const pantry = i.shipped === false || PANTRY_NAMES.has(i.name.trim().toLowerCase());
    ingredients.push({
      name,
      ...(amount.amount ? { qty: amount.amount } : {}),
      ...(unit ? { unit } : {}),
      ...(await linkIngredient(name, report)),
      ...(pantry ? { pantry: true } : {}),
      ...(i.imagePath ? { imageUrl: hfImage(i.imagePath, 200) } : {}),
    });
  }

  const steps = (recipe.steps ?? [])
    .map((s) => {
      let raw = (s.instructionsMarkdown ?? s.instructions ?? "").trim();
      // HelloFresh wraps long bullets onto several lines; EveryPlate uses one line per bullet.
      if (raw.includes("•")) raw = raw.replace(/\s*\n(?!\s*•)\s*/g, " ");
      // Some steps arrive as HTML (<p>, <br>, <li>, &amp;) even in the "markdown" field.
      const text = bulletLines(htmlToText(raw.replace(/\s*•\s*/g, "\n")));
      const image = s.images?.[0]?.path;
      return { text, ...(image ? { imageUrl: hfImage(image, 800) } : {}) };
    })
    .filter((s) => s.text);

  const tags = [brand, ...(recipe.cuisines ?? []).map(tagName), ...(recipe.tags ?? []).map(tagName)]
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t && !IGNORED_TAGS.has(t));
  const minutes = Math.max(isoMinutes(recipe.totalTime) ?? 0, isoMinutes(recipe.prepTime) ?? 0);
  const nutrition = nutritionOf(recipe);

  return {
    slug: `${BRAND_PREFIX[brand]}-${baseSlug}`,
    kind: "meal",
    title: recipe.name.replace(/"/g, "").trim(),
    ...(recipe.headline ? { subtitle: htmlToText(recipe.headline) } : {}),
    ...(recipe.description ? { description: htmlToText(recipe.description).replace(/\n/g, " ") } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(recipe.imagePath ? { imageUrl: hfImage(recipe.imagePath) } : {}),
    servings: chosen?.yields ?? servings,
    ...(minutes ? { prepMinutes: minutes } : {}),
    ...(nutrition ? { nutrition } : {}),
    tags: [...new Set(tags)],
    aliases: [],
    addedAt: today,
    ingredients,
    steps,
  };
}

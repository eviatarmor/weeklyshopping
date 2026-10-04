/**
 * Dinnerly Australia (a Marley Spoon brand). Recipes come from their GraphQL API:
 * the public menu endpoint lists every week back to 2018 (filterable to
 * vegetarian), and recipe details need the guest token embedded in any recipe page.
 */
import type { RecipeContent } from "../../src/shared/content.ts";
import { parseIngredient } from "../../src/shared/parse-ingredient.ts";
import { PANTRY_NAMES, UA, fetchText, htmlToText, linkIngredient, slugify, titleCase, today, type Report } from "./common.ts";

const PUBLIC_API = "https://api.dinnerly.com/public/graphql";
const API = "https://api.dinnerly.com/graphql";

const MENU_QUERY = `query GetMenu($country: CountryEnum!, $brand: BrandEnum!, $startDate: Date, $supportedRecipeTypes: [RecipeTypeEnum!], $numberOfWeeks: Int, $mealCategories: [MealCategoryEnum!], $recipeFilters: [RecipeFilterCategory!]) {
  menu(country: $country, brand: $brand, startDate: $startDate, supportedRecipeTypes: $supportedRecipeTypes, numberOfWeeks: $numberOfWeeks, mealCategories: $mealCategories, recipeFilters: $recipeFilters) {
    startOfWeek
    recipes { id slug title subtitle }
  }
}`;

const RECIPE_QUERY = `query GetRecipeDetails_Web($recipeId: String!) {
  recipe(id: $recipeId) {
    id title subtitle description dietType
    image(size: LARGE) { url }
    attributes { key name visible }
    duration { from to unit }
    nutritionalInformation { key perPortion }
    shippedIngredients { name nameWithQuantity image(size: MEDIUM) { url } }
    assumedIngredients { name }
    steps { title description image(size: LARGE) { url } }
  }
}`;

export type DinnerlyMenuRecipe = { id: string | number; slug: string; title: string; subtitle: string | null };

type DinnerlyRecipe = {
  id: string | number;
  title: string;
  subtitle: string | null;
  description: string | null;
  dietType: string | null;
  image: { url: string } | null;
  attributes: { key: string; name: string; visible: boolean }[];
  duration: { from: number; to: number; unit: string } | null;
  nutritionalInformation: { key: string; perPortion: number }[];
  shippedIngredients: { name: string; nameWithQuantity: string; image: { url: string } | null }[];
  assumedIngredients: { name: string }[];
  steps: { title: string | null; description: string; image: { url: string } | null }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every vegetarian/vegan recipe on Dinnerly AU menus, newest copy of each dish. */
export async function dinnerlyVegetarianMenu(): Promise<DinnerlyMenuRecipe[]> {
  const byDish = new Map<string, DinnerlyMenuRecipe>();
  const end = new Date("2018-01-01T00:00:00Z");
  // Walk backwards from a few weeks ahead, 4 weeks per request.
  for (let d = new Date(Date.now() + 8 * 7 * 864e5); d > end; d = new Date(d.getTime() - 4 * 7 * 864e5)) {
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
    const res = await fetch(PUBLIC_API, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({
        operationName: "GetMenu",
        query: MENU_QUERY,
        variables: {
          brand: "DN",
          country: "AU",
          startDate: monday,
          numberOfWeeks: 4,
          supportedRecipeTypes: ["STANDARD", "CORE_DOWN", "PREMIUM"],
          mealCategories: ["RTC"],
          recipeFilters: [{ key: "diets", values: ["vegetarian"] }],
        },
      }),
    });
    const json = (await res.json()) as { data?: { menu?: { recipes: DinnerlyMenuRecipe[] }[] } };
    for (const week of json.data?.menu ?? []) {
      for (const r of week.recipes) {
        const key = `${r.title}|${r.subtitle ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
        const prev = byDish.get(key);
        // Ids increase over time; keep the newest run of each dish.
        if (!prev || Number(r.id) > Number(prev.id)) byDish.set(key, r);
      }
    }
    await sleep(300);
  }
  return [...byDish.values()];
}

let token: Promise<string> | null = null;
/** Guest API token embedded in Dinnerly recipe pages. */
function apiToken(sampleId: string | number): Promise<string> {
  token ??= fetchText(`https://dinnerly.com.au/menu/${sampleId}-x`).then((html) => {
    const t = html.match(/gon\.api_token="([^"]+)"/)?.[1];
    if (!t) throw new Error("No Dinnerly API token on the recipe page");
    return t;
  });
  return token;
}

export async function fetchDinnerlyRecipe(id: string | number): Promise<DinnerlyRecipe> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA, authorization: `Bearer ${await apiToken(id)}` },
      body: JSON.stringify({ operationName: "GetRecipeDetails_Web", query: RECIPE_QUERY, variables: { recipeId: String(id) } }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { recipe?: DinnerlyRecipe }; errors?: { message: string }[] };
    if (json.data?.recipe) return json.data.recipe;
    if (attempt >= 4) throw new Error(json.errors?.[0]?.message ?? `HTTP ${res.status}`);
    // 403/429 means we're being throttled: back off hard and get a fresh guest token.
    if (res.status === 403 || res.status === 429) {
      token = null;
      await sleep(15_000 * (attempt + 1));
    } else {
      await sleep(1000 * (attempt + 1));
    }
  }
}

/** "__baby broccoli__" → "baby broccoli"; "1 stock cube*" → "1 stock cube". */
const plain = (text: string) => htmlToText(text).replace(/__([^_]+)__/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(\w)\*+/g, "$1").trim();

export async function convertDinnerly(recipe: DinnerlyRecipe, slug: string, report: Report): Promise<RecipeContent> {
  const ingredients: RecipeContent["ingredients"] = [];
  const add = async (raw: string, pantry: boolean, imageUrl?: string | null) => {
    // "(M) arborio rice": S/M/L are Dinnerly pack sizes, not quantities.
    const pack = raw.match(/^\(([SML])\)\s*/i);
    // "2 x 25g tomato chutney" / "1 x Chinese barbecue seasoning": a count of packs.
    const withoutPack = raw.replace(/^\([SML]\)\s*/i, "");
    const multi = withoutPack.match(/^(\d+)\s*x\s+(.*)$/i);
    const parsed = parseIngredient(multi ? multi[2]! : withoutPack);
    if (multi) parsed.qty = (parsed.qty ?? 1) * Number(multi[1]);
    const name = titleCase(parsed.name.replace(/\s+/g, " ").trim());
    if (!name) return;
    ingredients.push({
      name,
      ...(parsed.qty ? { qty: parsed.qty } : pack ? { qty: 1 } : {}),
      ...(parsed.unit ? { unit: parsed.unit } : pack ? { unit: "packet" } : {}),
      ...(await linkIngredient(name, report)),
      ...(pantry || PANTRY_NAMES.has(name.toLowerCase()) ? { pantry: true } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    });
  };
  for (const i of recipe.shippedIngredients) await add(i.nameWithQuantity || i.name, false, i.image?.url);
  for (const i of recipe.assumedIngredients) await add(i.name, true);

  const nutrient = (key: string) => recipe.nutritionalInformation.find((n) => n.key === key)?.perPortion;
  const kcal = nutrient("energy_kcal") ?? (nutrient("energy_kj") ? Math.round(nutrient("energy_kj")! / 4.184) : undefined);
  const tags = [
    "dinnerly",
    ...recipe.attributes.filter((a) => a.visible).map((a) => a.name.toLowerCase().trim()),
  ].filter((t, i, all) => t && all.indexOf(t) === i && !["vegetarian", "veggie"].includes(t));

  return {
    slug: `dn-${slugify(slug.replace(/^\d+-/, "")) || slugify(recipe.title)}`,
    kind: "meal",
    title: recipe.title.trim(),
    ...(recipe.subtitle ? { subtitle: recipe.subtitle.trim() } : {}),
    ...(recipe.description ? { description: plain(recipe.description).replace(/\n/g, " ") } : {}),
    sourceUrl: `https://dinnerly.com.au/menu/${slug}`,
    ...(recipe.image?.url ? { imageUrl: recipe.image.url } : {}),
    servings: 2,
    ...(recipe.duration?.to ? { prepMinutes: recipe.duration.to } : {}),
    ...(kcal
      ? {
          nutrition: {
            kcal: Math.round(kcal),
            ...(nutrient("protein") != null ? { proteinG: nutrient("protein")! } : {}),
            ...(nutrient("total_carbs") != null ? { carbsG: nutrient("total_carbs")! } : {}),
            ...(nutrient("total_fat") != null ? { fatG: nutrient("total_fat")! } : {}),
          },
        }
      : {}),
    tags,
    aliases: [],
    addedAt: today,
    ingredients,
    steps: recipe.steps
      .map((s) => {
        const text = plain(s.description).replace(/\n+/g, " ");
        return { text: s.title ? `${s.title.trim()}: ${text}` : text, ...(s.image?.url ? { imageUrl: s.image.url } : {}) };
      })
      .filter((s) => s.text),
  };
}

export function isDinnerlyVegetarian(recipe: DinnerlyRecipe): boolean {
  return /vegetarian|vegan/i.test(recipe.dietType ?? "");
}

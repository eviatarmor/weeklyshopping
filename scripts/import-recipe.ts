/**
 * Import recipes into content/recipes/*.json.
 *
 *   pnpm recipe:import <url> [<url> ...] [--force] [--servings 2] [--vegetarian]
 *
 * Supported: HelloFresh, EveryPlate, Mealime, and any site with schema.org Recipe
 * JSON-LD. Ingredients are matched to the catalog and to blends in content/blends.
 * Review the printed report, then commit. For whole collections see import-bulk.ts.
 */
import type { RecipeContent } from "../src/shared/content.ts";
import { parseIngredient } from "../src/shared/parse-ingredient.ts";
import { PANTRY_NAMES, fetchText, isoMinutes, linkIngredient, newReport, saveRecipe, slugify, titleCase, today, type Report } from "./lib/common.ts";
import { brandOf, convertHelloFresh, fetchHelloFreshRecipe } from "./lib/hellofresh.ts";
import { convertMealime, fetchMealimeRecipe } from "./lib/mealime.ts";

const args = process.argv.slice(2);
const force = args.includes("--force");
const vegetarian = args.includes("--vegetarian");
const servingsArg = args.indexOf("--servings");
const servings = servingsArg >= 0 ? Number(args[servingsArg + 1]) : 2;
const urls = args.filter((a, i) => /^https?:\/\//.test(a) && args[i - 1] !== "--servings");
if (urls.length === 0) {
  console.error("Usage: pnpm recipe:import <url> [<url> ...] [--force] [--servings 2] [--vegetarian]");
  process.exit(1);
}

type JsonLdRecipe = {
  "@type": string | string[];
  name: string;
  description?: string;
  image?: string | string[] | { url: string } | { url: string }[];
  recipeYield?: string | number | (string | number)[];
  recipeIngredient?: string[];
  recipeInstructions?: string | (string | { text?: string; itemListElement?: { text: string }[] })[];
  totalTime?: string;
  prepTime?: string;
  cookTime?: string;
  recipeCuisine?: string | string[];
  keywords?: string | string[];
};

function findJsonLdRecipe(html: string): JsonLdRecipe | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]!);
      const nodes: unknown[] = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const node of nodes as JsonLdRecipe[]) {
        const type = node?.["@type"];
        if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return node;
      }
    } catch {
      // ignore malformed blocks
    }
  }
  return null;
}

async function fromJsonLd(url: string, report: Report): Promise<RecipeContent> {
  const r = findJsonLdRecipe(await fetchText(url));
  if (!r) throw new Error("No schema.org Recipe found; write this one by hand");
  const image = Array.isArray(r.image) ? r.image[0] : r.image;
  const imageUrl = typeof image === "string" ? image : image?.url;
  const yieldValue = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  const recipeServings = Number(String(yieldValue ?? "").match(/\d+/)?.[0] ?? servings);

  const ingredients = [];
  for (const line of r.recipeIngredient ?? []) {
    const parsed = parseIngredient(line);
    const name = titleCase(parsed.name);
    ingredients.push({
      name,
      ...(parsed.qty ? { qty: parsed.qty } : {}),
      ...(parsed.unit ? { unit: parsed.unit } : {}),
      ...(await linkIngredient(name, report)),
      ...(PANTRY_NAMES.has(parsed.name.toLowerCase()) ? { pantry: true } : {}),
    });
  }

  const instructions = typeof r.recipeInstructions === "string" ? [r.recipeInstructions] : (r.recipeInstructions ?? []);
  const steps = instructions.flatMap((s) =>
    typeof s === "string" ? [s] : s.itemListElement ? s.itemListElement.map((e) => e.text) : s.text ? [s.text] : [],
  );
  const keywords = typeof r.keywords === "string" ? r.keywords.split(",") : (r.keywords ?? []);
  const cuisines = typeof r.recipeCuisine === "string" ? [r.recipeCuisine] : (r.recipeCuisine ?? []);
  const minutes = isoMinutes(r.totalTime) ?? ((isoMinutes(r.prepTime) ?? 0) + (isoMinutes(r.cookTime) ?? 0) || undefined);
  const site = new URL(url).hostname.replace(/^www\./, "").split(".")[0]!;

  return {
    slug: slugify(r.name),
    kind: "meal",
    title: r.name.trim(),
    ...(r.description ? { description: r.description.trim() } : {}),
    sourceUrl: url,
    ...(imageUrl ? { imageUrl } : {}),
    servings: recipeServings || servings,
    ...(minutes ? { prepMinutes: minutes } : {}),
    tags: [...new Set([site, ...cuisines, ...keywords].map((t) => t.toLowerCase().trim()).filter(Boolean))].slice(0, 8),
    aliases: [],
    addedAt: today,
    ingredients,
    steps: steps.map((text) => ({ text: text.trim() })).filter((s) => s.text),
  };
}

let failed = false;
for (const url of urls) {
  const report = newReport();
  try {
    const brand = brandOf(url);
    const host = new URL(url).hostname;
    let recipe: RecipeContent;
    if (brand) {
      recipe = await convertHelloFresh(await fetchHelloFreshRecipe(url), brand, report, servings);
    } else if (host.includes("mealime.com")) {
      const { recipe: ml, canonical } = await fetchMealimeRecipe(url);
      recipe = await convertMealime(ml, canonical, report);
    } else {
      recipe = await fromJsonLd(url, report);
    }
    const result = await saveRecipe(recipe, report, { force, vegetarian });
    if (result === "rejected") failed = true;
  } catch (error) {
    failed = true;
    console.error(`fail   ${url}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);

/**
 * Turns translated Mako recipes into content/recipes/mk-*.json.
 *
 * Mako (mako.co.il) recipes are in Hebrew. They're scraped to .cache/mako/raw/<id>.json
 * (schema.org Recipe JSON-LD) and translated to English into .cache/mako/en/<id>.json:
 *
 *   { id, meal, title, subtitle?, description?, servings, prepMinutes?, tags[],
 *     ingredients: [{ name, qty?, unit?, optional?, pantry? }], steps: string[] }
 *
 * or just { id, meal: false, title } for recipes that aren't meals.
 *
 * Only dinner-style meals (`meal: true`) are imported; the vegetarian check still runs.
 *
 *   pnpm tsx scripts/import-mako.ts [--force]
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import type { RecipeContent } from "../src/shared/content.ts";
import { PANTRY_NAMES, linkIngredient, newReport, rejections, saveRecipe, slugify, today } from "./lib/common.ts";

const translated = z.object({
  id: z.string(),
  meal: z.boolean(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  servings: z.number().positive().default(4),
  prepMinutes: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        qty: z.number().positive().nullish(),
        unit: z.string().nullish(),
        optional: z.boolean().optional(),
        pantry: z.boolean().optional(),
      }),
    )
    .min(1),
  steps: z.array(z.string().min(1)).min(1),
});

const force = process.argv.includes("--force");
const dir = ".cache/mako";
const counts = { wrote: 0, skipped: 0, rejected: 0, notMeal: 0, invalid: 0 };

for (const file of (await readdir(`${dir}/en`)).filter((f) => f.endsWith(".json")).sort()) {
  const json = JSON.parse(await readFile(`${dir}/en/${file}`, "utf8")) as { meal?: boolean };
  // Not a meal (dessert, dip, side…): the translator only records the decision.
  if (json.meal === false) {
    counts.notMeal++;
    continue;
  }
  const parsed = translated.safeParse(json);
  if (!parsed.success) {
    counts.invalid++;
    console.log(`invalid ${file}: ${parsed.error.issues[0]?.message}`);
    continue;
  }
  const en = parsed.data;
  if (!en.meal) {
    counts.notMeal++;
    continue;
  }
  const rawFile = `${dir}/raw/${en.id}.json`;
  if (!existsSync(rawFile)) continue;
  const raw = JSON.parse(await readFile(rawFile, "utf8")) as { url: string; recipe: { image?: string | { url?: string } } | null };
  const image = typeof raw.recipe?.image === "string" ? raw.recipe.image : raw.recipe?.image?.url;

  const report = newReport();
  const ingredients = [];
  for (const i of en.ingredients) {
    const pantry = i.pantry || PANTRY_NAMES.has(i.name.trim().toLowerCase());
    ingredients.push({
      name: i.name.trim(),
      ...(i.qty ? { qty: i.qty } : {}),
      ...(i.unit ? { unit: i.unit } : {}),
      ...(await linkIngredient(i.name, report)),
      ...(i.optional ? { optional: true } : {}),
      ...(pantry ? { pantry: true } : {}),
    });
  }
  const recipe: RecipeContent = {
    slug: `mk-${slugify(en.title)}`,
    kind: "meal",
    title: en.title,
    ...(en.subtitle ? { subtitle: en.subtitle } : {}),
    ...(en.description ? { description: en.description } : {}),
    sourceUrl: raw.url,
    ...(image ? { imageUrl: image } : {}),
    servings: en.servings,
    ...(en.prepMinutes ? { prepMinutes: en.prepMinutes } : {}),
    tags: ["mako", ...en.tags.map((t) => t.toLowerCase())],
    aliases: [],
    addedAt: today,
    ingredients,
    steps: en.steps.map((text) => ({ text })),
  };
  const result = await saveRecipe(recipe, report, { force, vegetarian: true, quiet: true });
  counts[result]++;
}

console.log(counts);
if (rejections.length) console.log("rejected (meat):", rejections.map((r) => `${r.slug} (${r.meat.join(", ")})`).join("; "));

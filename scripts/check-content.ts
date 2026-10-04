/**
 * Validates content/: schemas, product/blend references, duplicate slugs, blend cycles and leftover HTML.
 *
 *   pnpm content:check
 */
import { readFile, readdir } from "node:fs/promises";
import { catalogSchema, recipeSchema, type RecipeContent } from "../src/shared/content.ts";
import { SECTION_IDS } from "../src/shared/sections.ts";
import { HTML_PATTERN } from "./lib/common.ts";

const errors: string[] = [];
const catalog = catalogSchema.parse(JSON.parse(await readFile("content/catalog.json", "utf8")));
const products = new Set(catalog.map((p) => p.slug));
for (const p of catalog) if (!SECTION_IDS.includes(p.section)) errors.push(`catalog ${p.slug}: unknown section ${p.section}`);

const recipes: (RecipeContent & { file: string })[] = [];
for (const dir of ["content/recipes", "content/blends"]) {
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = `${dir}/${file}`;
    const parsed = recipeSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    if (!parsed.success) {
      errors.push(`${path}: ${parsed.error.message}`);
      continue;
    }
    if (`${parsed.data.slug}.json` !== file) errors.push(`${path}: slug "${parsed.data.slug}" doesn't match file name`);
    if (dir.endsWith("blends") !== (parsed.data.kind === "blend")) errors.push(`${path}: kind "${parsed.data.kind}" in wrong folder`);
    recipes.push({ ...parsed.data, file: path });
  }
}

const bySlug = new Map<string, RecipeContent>();
for (const r of recipes) {
  if (bySlug.has(r.slug)) errors.push(`duplicate recipe slug ${r.slug}`);
  bySlug.set(r.slug, r);
}

for (const r of recipes) {
  for (const i of r.ingredients) {
    if (i.product && !products.has(i.product)) errors.push(`${r.file}: unknown product "${i.product}"`);
    if (i.blend && bySlug.get(i.blend)?.kind !== "blend") errors.push(`${r.file}: unknown blend "${i.blend}"`);
  }
  const texts = [r.title, r.subtitle, r.description, ...r.steps.map((s) => s.text), ...r.ingredients.map((i) => i.name)];
  if (texts.some((t) => t && HTML_PATTERN.test(t))) errors.push(`${r.file}: contains HTML; run pnpm content:clean-html`);
}

function hasCycle(slug: string, stack: string[]): boolean {
  if (stack.includes(slug)) return true;
  const r = bySlug.get(slug);
  return !!r?.ingredients.some((i) => i.blend && hasCycle(i.blend, [...stack, slug]));
}
for (const r of recipes) if (r.kind === "blend" && hasCycle(r.slug, [])) errors.push(`${r.file}: blend cycle`);

const meals = recipes.filter((r) => r.kind === "meal").length;
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.log(`ok: ${catalog.length} products, ${meals} meals, ${recipes.length - meals} blends`);

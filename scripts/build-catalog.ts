/**
 * Builds content/catalog.json from scripts/catalog-seed.ts and matches each
 * product to a public TheMealDB ingredient image. Nothing is downloaded or stored
 * except the image URL.
 *
 *   pnpm catalog:build
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { CATALOG_SEED } from "./catalog-seed.ts";
import { normalizeName } from "../src/shared/normalize.ts";
import { SECTION_IDS } from "../src/shared/sections.ts";

const MEALDB_LIST = "https://www.themealdb.com/api/json/v1/1/list.php?i=list";
const CACHE = ".cache/mealdb-ingredients.json";

async function mealDbIngredients(): Promise<string[]> {
  if (!existsSync(CACHE)) {
    const res = await fetch(MEALDB_LIST);
    if (!res.ok) throw new Error(`TheMealDB list failed: ${res.status}`);
    await mkdir(".cache", { recursive: true });
    await writeFile(CACHE, await res.text());
  }
  const data = JSON.parse(await readFile(CACHE, "utf8")) as { meals: { strIngredient: string }[] };
  return data.meals.map((m) => m.strIngredient.trim()).filter(Boolean);
}

const imageUrl = (ingredient: string) =>
  `https://www.themealdb.com/images/ingredients/${encodeURIComponent(ingredient)}-Small.png`;

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ingredients = await mealDbIngredients();
const exact = new Map(ingredients.map((i) => [i.toLowerCase(), i]));
const normalized = new Map<string, string>();
for (const i of ingredients) if (!normalized.has(normalizeName(i))) normalized.set(normalizeName(i), i);

const catalog = [];
const seen = new Set<string>();
const warnings: string[] = [];

for (const [section, lines] of Object.entries(CATALOG_SEED)) {
  if (!SECTION_IDS.includes(section)) throw new Error(`Unknown section ${section}`);
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    const name = parts[0]!;
    const override = parts.find((p) => p.startsWith("@"))?.slice(1).trim();
    const aliases = parts
      .slice(1)
      .filter((p) => !p.startsWith("@"))
      .flatMap((p) => p.split(","))
      .map((a) => a.trim())
      .filter(Boolean);

    let image: string | undefined;
    if (override) {
      image = exact.get(override.toLowerCase());
      if (!image) warnings.push(`@${override} (for ${name}) is not a TheMealDB ingredient`);
    }
    for (const candidate of [name, ...aliases]) {
      if (image) break;
      image = exact.get(candidate.toLowerCase()) ?? normalized.get(normalizeName(candidate));
    }

    const slug = slugify(name);
    if (seen.has(slug)) throw new Error(`Duplicate slug ${slug}`);
    seen.add(slug);
    catalog.push({ slug, name, aliases, section, ...(image ? { imageUrl: imageUrl(image) } : {}) });
  }
}

await writeFile("content/catalog.json", `${JSON.stringify(catalog, null, 2)}\n`);
const withImages = catalog.filter((c) => c.imageUrl).length;
console.log(`Wrote ${catalog.length} products (${withImages} with images) to content/catalog.json`);
for (const w of warnings) console.warn(`warn: ${w}`);
const missing = catalog.filter((c) => !c.imageUrl).map((c) => c.name);
if (missing.length) console.log(`No image (emoji fallback): ${missing.join(", ")}`);

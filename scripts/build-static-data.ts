/**
 * Generates the static recipe data the app reads directly (no server request):
 *
 *   public/data/recipes.json      every meal and blend, card fields only
 *   public/data/r/<slug>.json     one file per recipe, blends and images resolved
 *   public/data/catalog.json      grocery products for autocomplete
 *
 * Runs automatically before `dev` and `build`; output is gitignored.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { catalogSchema, recipeSchema } from "../src/shared/content.ts";
import { fnv1a } from "../src/shared/hash.ts";
import type { StaticCatalog } from "../src/shared/static-data.ts";
import { buildStore, indexEntry, recipeDetail } from "../src/server/content-store.ts";

const OUT = "public/data";

const catalogRaw = await readFile("content/catalog.json", "utf8");
const catalog = catalogSchema.parse(JSON.parse(catalogRaw));
const recipes = [];
for (const dir of ["content/recipes", "content/blends"]) {
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
    const raw = await readFile(`${dir}/${file}`, "utf8");
    recipes.push({ ...recipeSchema.parse(JSON.parse(raw)), hash: fnv1a(raw) });
  }
}
const catalogHash = fnv1a(catalogRaw);
const store = buildStore({ catalog, catalogHash, recipes, version: fnv1a(catalogHash + recipes.map((r) => r.hash).join(",")) });

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/r`, { recursive: true });

await writeFile(`${OUT}/recipes.json`, JSON.stringify(store.recipes.map(indexEntry)));
const staticCatalog: StaticCatalog = { products: store.products };
await writeFile(`${OUT}/catalog.json`, JSON.stringify(staticCatalog));
for (const r of store.recipes) await writeFile(`${OUT}/r/${r.slug}.json`, JSON.stringify(recipeDetail(store, r.slug)));
await writeFile(`${OUT}/version.json`, JSON.stringify({ version: store.version, recipes: store.recipes.length }));

console.log(`Static data: ${store.recipes.length} recipes, ${store.products.length} products (version ${store.version})`);

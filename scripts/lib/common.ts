import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { catalogSchema, recipeSchema, type RecipeContent } from "../../src/shared/content.ts";
import { normalizeName } from "../../src/shared/normalize.ts";

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const today = new Date().toISOString().slice(0, 10);

/** HelloFresh's image CDN (also serves EveryPlate). The width is rewritten by the app for thumbnails. */
export const hfImage = (path: string, width = 1200) => `https://img.hellofresh.com/f_auto,fl_lossy,q_auto,w_${width}/hellofresh_s3${path.startsWith("/") ? "" : "/"}${path}`;

const BLEND_PATTERN = /\b(seasoning|spice blend|spice mix|spice rub|rub)\b/i;

/** Staples recipes assume you have; they start as "already have" in the pantry check. */
export const PANTRY_NAMES = new Set([
  "olive oil", "extra virgin olive oil", "salt", "pepper", "black pepper", "salt and pepper", "butter", "vinegar",
  "sugar", "brown sugar", "plain flour", "soy sauce", "vegetable oil", "canola oil", "honey", "water", "egg", "eggs", "oil",
]);

const MEAT_PATTERN =
  /\b(chicken|beef|pork|lamb|bacon|prawns?|shrimp|fish|salmon|barramundi|basa|hoki|cod|chorizo|sausages?|ham|turkey|prosciutto|salami|pancetta|anchov\w*|tuna|duck|veal|venison|kangaroo|squid|calamari|mussels?|clams?|crab|lobster|steak|mince|gelatine?)\b/i;
// "Plant-based mince", "chicken-style stock" and the like are vegetarian.
// Australian "chicken salt" is a seasoning, normally made without chicken.
const MEAT_EXCEPTIONS = /\b(chicken|beef)-style\b|plant-based|vegan|veggie|vegetarian|meat-free|meatless|vegetable stock|mushroom stock|chicken salt/i;

export function meatIngredients(names: string[]): string[] {
  return names.filter((n) => MEAT_PATTERN.test(n) && !MEAT_EXCEPTIONS.test(n));
}

export function titleCase(s: string) {
  return s
    .replace(/(^|[\s-])([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|With|Of|In|The|A|Or)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (m) => m.toUpperCase());
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isoMinutes(iso: string | undefined | null): number | undefined {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return total > 0 ? total : undefined;
}

export type Report = { unmatched: string[]; missingBlends: string[] };
export const newReport = (): Report => ({ unmatched: [], missingBlends: [] });

type Indexes = { products: Map<string, string>; blends: Map<string, string> };
let indexes: Indexes | null = null;

export async function loadIndexes(): Promise<Indexes> {
  if (indexes) return indexes;
  const catalog = catalogSchema.parse(JSON.parse(await readFile("content/catalog.json", "utf8")));
  const products = new Map<string, string>();
  for (const p of catalog) for (const n of [p.name, ...p.aliases]) if (!products.has(normalizeName(n))) products.set(normalizeName(n), p.slug);
  const blends = new Map<string, string>();
  for (const file of await readdir("content/blends")) {
    if (!file.endsWith(".json")) continue;
    const blend = recipeSchema.parse(JSON.parse(await readFile(`content/blends/${file}`, "utf8")));
    for (const n of [blend.title, ...blend.aliases]) blends.set(normalizeName(n), blend.slug);
  }
  indexes = { products, blends };
  return indexes;
}

function matchProduct(products: Map<string, string>, name: string): string | undefined {
  const key = normalizeName(name);
  if (products.has(key)) return products.get(key);
  // Drop leading descriptors: "fresh baby spinach" → "baby spinach" → "spinach".
  const words = key.split(" ");
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(" ");
    if (products.has(tail)) return products.get(tail);
  }
  return undefined;
}

/** Link an ingredient name to a blend recipe or catalog product. */
export async function linkIngredient(name: string, report: Report): Promise<{ blend?: string; product?: string }> {
  const { products, blends } = await loadIndexes();
  const blend = blends.get(normalizeName(name));
  if (blend) return { blend };
  if (BLEND_PATTERN.test(name)) report.missingBlends.push(name);
  const product = matchProduct(products, name);
  if (!product) report.unmatched.push(name);
  return product ? { product } : {};
}

export type SaveOptions = { force: boolean; vegetarian: boolean; quiet?: boolean };
export type SaveResult = "wrote" | "skipped" | "rejected";

/** Why recipes were rejected by the vegetarian check, for review. */
export const rejections: { slug: string; meat: string[] }[] = [];

/** Validate and write content/recipes/<slug>.json, printing what needs attention. */
export async function saveRecipe(recipe: RecipeContent, report: Report, options: SaveOptions): Promise<SaveResult> {
  if (options.vegetarian) {
    // Ingredients only: a vegetarian variant can keep a title like "Sausage Rice Bowl" (made with veggie sausage).
    const meat = meatIngredients(recipe.ingredients.map((i) => i.name));
    if (meat.length) {
      rejections.push({ slug: recipe.slug, meat });
      if (!options.quiet) console.log(`reject ${recipe.slug}: not vegetarian (${meat.join(", ")})`);
      return "rejected";
    }
    if (!recipe.tags.includes("vegetarian")) recipe.tags.unshift("vegetarian");
  }
  const parsed = recipeSchema.parse(recipe);
  const file = `content/recipes/${parsed.slug}.json`;
  if (existsSync(file) && !options.force) {
    if (!options.quiet) console.log(`skip   ${file} (exists; use --force to overwrite)`);
    return "skipped";
  }
  await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
  if (!options.quiet) {
    console.log(`wrote  ${file} — ${parsed.title} (${parsed.ingredients.length} ingredients)`);
    if (report.missingBlends.length) console.log(`  blends without a recipe: ${report.missingBlends.join(", ")}`);
    if (report.unmatched.length) console.log(`  not in catalog: ${report.unmatched.join(", ")}`);
  }
  return "wrote";
}

export async function fetchText(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "text/html,application/json", ...init.headers } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export function nextData<T = any>(html: string): T {
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error("No __NEXT_DATA__ on page");
  return JSON.parse(json);
}

/** Run `fn` over `items` with limited concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!, i);
      }
    }),
  );
  return results;
}

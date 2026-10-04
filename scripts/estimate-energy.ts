/**
 * Estimates energy and macros per serving for meals whose source didn't publish nutrition,
 * by adding up their ingredients with content/ingredient-nutrition.json.
 * Estimated values are marked `nutrition.estimated: true` so the app can say so.
 *
 *   pnpm tsx scripts/estimate-energy.ts [--force]   (--force also recomputes earlier estimates)
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { recipeSchema } from "../src/shared/content.ts";
import { normalizeUnit } from "../src/shared/units.ts";

/**
 * Per 100 g: kcal and protein/carbs/fat in grams; `g` = grams per unit ("count", "cup", "tbsp", …).
 * `kit` = grams of one pre-portioned meal-kit unit ("1 packet" of rice in a 2-person HelloFresh box).
 */
type Nutrient = { kcal: number; p: number; c: number; f: number; g: Record<string, number>; kit?: Record<string, number> };
const table: Record<string, Nutrient> = JSON.parse(await readFile("content/ingredient-nutrition.json", "utf8"));
const force = process.argv.includes("--force");

/** Grams for one unit, falling back to related units (a cup is 12.5 tablespoons, and so on). */
function gramsPerUnit(n: Nutrient, unit: string, mealKit: boolean): number | undefined {
  const g = n.g;
  if (mealKit && n.kit?.[unit] != null) return n.kit[unit];
  if (unit === "g") return 1;
  if (unit === "kg") return 1000;
  if (unit === "ml") return g.ml ?? 1;
  if (unit === "l") return (g.ml ?? 1) * 1000;
  if (g[unit] != null) return g[unit];
  if (unit === "tsp" && g.tbsp) return g.tbsp / 4;
  if (unit === "tbsp" && g.tsp) return g.tsp * 4;
  if (unit === "cup" && g.tbsp) return g.tbsp * 12.5;
  if (unit === "tbsp" && g.cup) return g.cup / 12.5;
  if (unit === "tsp" && g.cup) return g.cup / 50;
  if (unit === "pinch") return 0.3;
  return undefined;
}

const missing = new Map<string, number>();
const outliers: string[] = [];
let estimated = 0;
for (const file of (await readdir("content/recipes")).filter((f) => f.endsWith(".json"))) {
  const path = `content/recipes/${file}`;
  const recipe = recipeSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (recipe.kind !== "meal" || (recipe.nutrition && !(force && recipe.nutrition.estimated))) continue;

  const total = { kcal: 0, p: 0, c: 0, f: 0 };
  let known = 0;
  for (const i of recipe.ingredients) {
    if (i.optional) continue;
    const n = table[i.name.toLowerCase().trim()];
    if (!n) {
      missing.set(i.name, (missing.get(i.name) ?? 0) + 1);
      continue;
    }
    const unit = normalizeUnit(i.unit) ?? "count";
    let qty = i.qty;
    if (qty == null) {
      // "Olive oil for frying": count it as a tablespoon. Other unmeasured items (salt, herbs to taste) are negligible.
      if (n.kcal >= 600 && n.g.tbsp) {
        total.kcal += (n.g.tbsp * n.kcal) / 100;
        total.f += (n.g.tbsp * n.f) / 100;
      }
      known++;
      continue;
    }
    const per = gramsPerUnit(n, unit, /^(hf|ep|dn)-/.test(recipe.slug));
    if (per == null) {
      missing.set(`${i.name} (${unit})`, (missing.get(`${i.name} (${unit})`) ?? 0) + 1);
      continue;
    }
    const grams = qty * per;
    total.kcal += (grams * n.kcal) / 100;
    total.p += (grams * n.p) / 100;
    total.c += (grams * n.c) / 100;
    total.f += (grams * n.f) / 100;
    known++;
  }
  // Too little known to say anything useful.
  if (known < Math.max(2, recipe.ingredients.filter((i) => !i.optional).length * 0.6)) continue;

  const servings = recipe.servings || 4;
  const kcal = Math.round(total.kcal / servings);
  if (kcal < 150 || kcal > 1800) outliers.push(`${recipe.slug}: ${kcal} kcal`);
  if (kcal < 80) continue;
  const round1 = (x: number) => Math.round((x / servings) * 10) / 10;
  recipe.nutrition = { kcal, proteinG: round1(total.p), carbsG: round1(total.c), fatG: round1(total.f), estimated: true };
  await writeFile(path, `${JSON.stringify(recipe, null, 2)}\n`);
  estimated++;
}

console.log(`estimated ${estimated} meals`);
if (missing.size) console.log("no nutrition for:", [...missing].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n, c]) => `${n} ×${c}`).join(", "));
if (outliers.length) console.log(`check these (unusual per-serving energy):\n  ${outliers.join("\n  ")}`);

/**
 * Re-applies correctedKcal() to recipe nutrition already in content/ (fixes kJ
 * published as kcal) without re-importing.
 *
 *   pnpm content:fix-energy
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { correctedKcal } from "../src/shared/measure.ts";

let fixed = 0;
for (const file of await readdir("content/recipes")) {
  const path = `content/recipes/${file}`;
  const recipe = JSON.parse(await readFile(path, "utf8"));
  const n = recipe.nutrition;
  if (!n) continue;
  const kcal = correctedKcal(n.kcal, n);
  if (kcal !== n.kcal) {
    n.kcal = kcal;
    await writeFile(path, `${JSON.stringify(recipe, null, 2)}\n`);
    fixed++;
  }
}
console.log(`Corrected energy in ${fixed} recipes`);

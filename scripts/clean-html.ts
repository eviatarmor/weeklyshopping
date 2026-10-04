/**
 * Strips HTML (<p>, <br>, <li>, &amp; ...) that some sources left in recipe text.
 * Safe to re-run; files without HTML are untouched.
 *
 *   pnpm content:clean-html
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { HTML_PATTERN, bulletLines, htmlToText } from "./lib/common.ts";

let changed = 0;
for (const dir of ["content/recipes", "content/blends"]) {
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = `${dir}/${file}`;
    const recipe = JSON.parse(await readFile(path, "utf8"));
    let dirty = false;
    const clean = (value: string, multiline: boolean) => {
      if (!HTML_PATTERN.test(value)) return value;
      dirty = true;
      const text = htmlToText(value.replace(/\s*•\s*/g, "\n"));
      return multiline ? bulletLines(text) : text.replace(/\n/g, " ");
    };
    for (const key of ["title", "subtitle", "description"]) if (typeof recipe[key] === "string") recipe[key] = clean(recipe[key], false);
    for (const step of recipe.steps ?? []) step.text = clean(step.text, true);
    for (const ingredient of recipe.ingredients ?? []) ingredient.name = clean(ingredient.name, false);
    recipe.steps = (recipe.steps ?? []).filter((s: { text: string }) => s.text);
    if (dirty) {
      await writeFile(path, `${JSON.stringify(recipe, null, 2)}\n`);
      changed++;
    }
  }
}
console.log(`Cleaned HTML from ${changed} files`);

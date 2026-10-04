export type RecipeSource = { id: string; label: string };

const SOURCES: [RegExp, RecipeSource][] = [
  [/hellofresh\./, { id: "hellofresh", label: "HelloFresh" }],
  [/everyplate\./, { id: "everyplate", label: "EveryPlate" }],
  [/mealime\.com/, { id: "mealime", label: "Mealime" }],
  [/reddit\.com/, { id: "reddit", label: "r/hellofresh" }],
];

/** Where a recipe came from, for badges and filtering. */
export function recipeSource(sourceUrl: string | null | undefined): RecipeSource {
  if (!sourceUrl) return { id: "house", label: "Our recipe" };
  for (const [pattern, source] of SOURCES) if (pattern.test(sourceUrl)) return source;
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  return { id: host, label: host };
}

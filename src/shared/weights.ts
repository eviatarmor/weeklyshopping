/**
 * Per-ingredient weights and nutrition (content/ingredient-nutrition.json):
 * per 100 g kcal/protein/carbs/fat, grams per unit ("count", "cup", "tbsp"…), and for
 * meal-kit recipes the grams of one pre-portioned unit ("1 packet" of rice in a 2-person box).
 */
export type IngredientInfo = { kcal: number; p: number; c: number; f: number; g: Record<string, number>; kit?: Record<string, number> };

/** Grams for one unit, falling back to related units (a cup is 12.5 tablespoons, and so on). */
export function gramsPerUnit(n: IngredientInfo, unit: string, mealKit: boolean): number | undefined {
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

/** Meal-kit recipes: "1 packet" means the box's portion, not a supermarket pack. */
export const isMealKit = (slug: string) => /^(hf|ep|dn)-/.test(slug);

import type { BlendRecipe, IngredientRow } from "./expand";
import type { RecipeSource } from "./sources";

/** Recipe shapes the server sends to the app. Content is held in memory on the server (see content-store.ts). */

/** One card in the recipe list. */
export type RecipeIndexEntry = {
  slug: string;
  kind: "meal" | "blend";
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  source: RecipeSource;
  prepMinutes: number | null;
  kcal: number | null;
  tags: string[];
  addedAt: string;
};

export type RecipeFields = {
  slug: string;
  kind: "meal" | "blend";
  title: string;
  subtitle: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  servings: number;
  yieldUnit: string | null;
  prepMinutes: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tags: string[];
  steps: { text: string; imageUrl?: string }[];
  addedAt: string;
};

/** Everything the recipe page needs that doesn't depend on who's looking. */
export type RecipeDetail = {
  recipe: RecipeFields;
  ingredients: IngredientRow[];
  /** Every blend reachable from the ingredients, for "make it from scratch". */
  blends: Record<string, BlendRecipe>;
  productImages: Record<string, string | null>;
  /** For blends: the recipes that use it. */
  usedIn: { slug: string; title: string }[];
};


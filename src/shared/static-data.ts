import type { BlendRecipe, IngredientRow } from "./expand";
import type { RecipeSource } from "./sources";

/**
 * Recipe content is generated at build time into static files under /data/.
 * Static assets are free and unlimited on Workers and never reach the Durable
 * Object, so browsing recipes costs no server requests or database reads.
 */
export const STATIC_DATA = {
  index: "/data/recipes.json",
  catalog: "/data/catalog.json",
  recipe: (slug: string) => `/data/r/${slug}.json`,
} as const;

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

export type CatalogProduct = { slug: string; name: string; aliases: string[]; sectionId: string; imageUrl: string | null };
export type StaticCatalog = { products: CatalogProduct[] };

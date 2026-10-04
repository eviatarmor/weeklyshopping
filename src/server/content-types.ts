import type { CatalogEntry, RecipeContent } from "@/shared/content";

export type HashedRecipe = RecipeContent & { hash: string };
/** `version` changes whenever the catalog or any recipe changes; use it as a cache key. */
export type Content = { catalog: CatalogEntry[]; catalogHash: string; recipes: HashedRecipe[]; version: string };

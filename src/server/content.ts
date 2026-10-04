import { catalogSchema, recipeSchema } from "@/shared/content";
import { fnv1a } from "@/shared/hash";
import type { Content } from "./content-types";

export type { Content, HashedRecipe } from "./content-types";

// Lazy so the (large) recipe JSON is only parsed inside the Durable Object, not on every Worker start.
const recipeModules = import.meta.glob<unknown>(["../../content/recipes/*.json", "../../content/blends/*.json"], {
  import: "default",
});


/**
 * Content bundled into the Worker at build time. Called once per Durable Object
 * start; not cached here so only the in-memory store keeps a copy.
 */
export async function loadContent(): Promise<Content> {
  const catalogJson = (await import("../../content/catalog.json")).default;
  const catalog = catalogSchema.parse(catalogJson);
  const entries = Object.entries(recipeModules).sort(([a], [b]) => a.localeCompare(b));
  const recipes = await Promise.all(
    entries.map(async ([file, load]) => {
      const raw = await load();
      const parsed = recipeSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`Invalid recipe ${file}: ${parsed.error.message}`);
      return { ...parsed.data, hash: fnv1a(JSON.stringify(raw)) };
    }),
  );
  const catalogHash = fnv1a(JSON.stringify(catalogJson));
  return { catalog, catalogHash, recipes, version: fnv1a(catalogHash + recipes.map((r) => r.hash).join(",")) };
}

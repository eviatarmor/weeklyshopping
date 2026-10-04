import { catalogSchema, recipeSchema, type CatalogEntry, type RecipeContent } from "@/shared/content";

// Lazy so the (large) recipe JSON is only parsed inside the Durable Object, not on every Worker start.
const recipeModules = import.meta.glob<unknown>(["../../content/recipes/*.json", "../../content/blends/*.json"], {
  import: "default",
});

export type HashedRecipe = RecipeContent & { hash: string };
export type Content = { catalog: CatalogEntry[]; catalogHash: string; recipes: HashedRecipe[] };

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

let cached: Promise<Content> | null = null;

/** Content bundled into the Worker at build time, validated once per isolate. */
export function loadContent(): Promise<Content> {
  cached ??= (async () => {
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
    return { catalog, catalogHash: fnv1a(JSON.stringify(catalogJson)), recipes };
  })();
  return cached;
}

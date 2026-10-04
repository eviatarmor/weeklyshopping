import { buildProductIndex, type ClassifyProduct } from "@/shared/classify";
import type { IngredientRow } from "@/shared/expand";
import { normalizeUnit } from "@/shared/units";
import type { Content } from "./content";

export type StoreProduct = { slug: string; name: string; aliases: string[]; sectionId: string; imageUrl: string | null };

export type StoreRecipe = {
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
  ingredients: IngredientRow[];
};

/**
 * Recipes and the catalog, held in memory. They're bundled with each deploy and
 * never change at runtime, so they don't live in SQLite: that keeps Durable
 * Object row writes for user data only.
 */
export type ContentStore = {
  version: string;
  recipes: StoreRecipe[];
  bySlug: Map<string, StoreRecipe>;
  /** Blend slug → meals and blends that use it. */
  usedBy: Map<string, StoreRecipe[]>;
  products: StoreProduct[];
  productBySlug: Map<string, StoreProduct>;
  productIndex: Map<string, ClassifyProduct>;
};

export function buildStore(content: Content): ContentStore {
  const recipes: StoreRecipe[] = content.recipes.map((r) => ({
    slug: r.slug,
    kind: r.kind,
    title: r.title,
    subtitle: r.subtitle ?? null,
    description: r.description ?? null,
    imageUrl: r.imageUrl ?? null,
    sourceUrl: r.sourceUrl ?? null,
    servings: r.servings,
    yieldUnit: r.yieldUnit ?? null,
    prepMinutes: r.prepMinutes ?? null,
    kcal: r.nutrition?.kcal ?? null,
    proteinG: r.nutrition?.proteinG ?? null,
    carbsG: r.nutrition?.carbsG ?? null,
    fatG: r.nutrition?.fatG ?? null,
    tags: r.tags,
    steps: r.steps,
    addedAt: r.addedAt,
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      qty: i.qty ?? null,
      unit: normalizeUnit(i.unit),
      productSlug: i.product ?? null,
      blendSlug: i.blend ?? null,
      optional: i.optional ?? false,
      pantry: i.pantry ?? false,
      imageUrl: i.imageUrl ?? null,
    })),
  }));
  const usedBy = new Map<string, StoreRecipe[]>();
  for (const r of recipes) {
    for (const slug of new Set(r.ingredients.map((i) => i.blendSlug).filter((s): s is string => !!s))) {
      usedBy.set(slug, [...(usedBy.get(slug) ?? []), r]);
    }
  }
  const products: StoreProduct[] = content.catalog.map((p) => ({
    slug: p.slug,
    name: p.name,
    aliases: p.aliases,
    sectionId: p.section,
    imageUrl: p.imageUrl ?? null,
  }));
  return {
    version: content.version,
    recipes,
    bySlug: new Map(recipes.map((r) => [r.slug, r])),
    usedBy,
    products,
    productBySlug: new Map(products.map((p) => [p.slug, p])),
    productIndex: buildProductIndex(products),
  };
}

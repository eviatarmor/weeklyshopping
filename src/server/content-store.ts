import { buildProductIndex, type ClassifyProduct } from "@/shared/classify";
import type { BlendRecipe, IngredientRow } from "@/shared/expand";
import { recipeSource } from "@/shared/sources";
import type { RecipeDetail, RecipeIndexEntry } from "@/shared/recipe-types";
import { equipmentFor } from "@/shared/equipment";
import { normalizeUnit } from "@/shared/units";
import type { Content } from "./content-types";

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
  nutritionEstimated: boolean;
  tags: string[];
  steps: { text: string; imageUrl?: string }[];
  /** Kitchen tools mentioned in the method. */
  equipment: string[];
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
    nutritionEstimated: r.nutrition?.estimated ?? false,
    tags: r.tags,
    steps: r.steps,
    equipment: equipmentFor(r.steps),
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

/** The recipe page's content. */
export function recipeDetail(store: ContentStore, slug: string): RecipeDetail | null {
  const found = store.bySlug.get(slug);
  if (!found) return null;
  const { ingredients, ...recipe } = found;
  const blends: Record<string, BlendRecipe> = {};
  const pending = [...ingredients];
  while (pending.length) {
    const blendSlug = pending.pop()!.blendSlug;
    if (!blendSlug || blends[blendSlug]) continue;
    const b = store.bySlug.get(blendSlug);
    if (!b) continue;
    blends[blendSlug] = { slug: b.slug, title: b.title, servings: b.servings, yieldUnit: b.yieldUnit, ingredients: b.ingredients };
    pending.push(...b.ingredients);
  }
  const allRows = [ingredients, ...Object.values(blends).map((b) => b.ingredients)].flat();
  const productImages = Object.fromEntries(
    [...new Set(allRows.map((r) => r.productSlug).filter((s): s is string => !!s))].map((p) => [p, store.productBySlug.get(p)?.imageUrl ?? null]),
  );
  const usedIn = recipe.kind === "blend" ? (store.usedBy.get(recipe.slug) ?? []).map((r) => ({ slug: r.slug, title: r.title })) : [];
  return { recipe, ingredients, blends, productImages, usedIn };
}

/** One card in the recipe list. */
export function indexEntry(r: StoreRecipe): RecipeIndexEntry {
  return {
    slug: r.slug,
    kind: r.kind,
    title: r.title,
    subtitle: r.subtitle,
    imageUrl: r.imageUrl,
    source: recipeSource(r.sourceUrl),
    prepMinutes: r.prepMinutes,
    kcal: r.kcal,
    tags: r.tags,
    addedAt: r.addedAt,
  };
}

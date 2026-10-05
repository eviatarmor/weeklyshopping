import { normalizeName } from "./normalize";
import { addQuantities, normalizeUnit, roundQty } from "./units";

export type IngredientRow = {
  name: string;
  qty: number | null;
  unit: string | null;
  productSlug: string | null;
  blendSlug: string | null;
  optional: boolean;
  pantry: boolean;
  imageUrl: string | null;
  /** Grams per ml, from the ingredient table, for converting spoons/cups to grams. */
  density?: number | null;
};

export type BlendRecipe = {
  slug: string;
  title: string;
  servings: number;
  yieldUnit: string | null;
  ingredients: IngredientRow[];
};

export type ShoppingLine = {
  /** Stable key for UI state (have / don't have). */
  key: string;
  name: string;
  qty: number | null;
  unit: string | null;
  productSlug: string | null;
  /** Set when this line is a blend bought as-is. */
  blendSlug: string | null;
  optional: boolean;
  pantry: boolean;
  imageUrl: string | null;
  /** Titles of the blends this line was expanded from. */
  via: string[];
  /** Grams per ml (see IngredientRow). */
  density?: number | null;
};

export type BlendChoice = "buy" | "scratch";

/** How many batches of `blend` an ingredient line asks for ("2 sachets" of a 1-sachet blend = 2). */
export function batchesFor(row: { qty: number | null; unit: string | null }, blend: BlendRecipe): number {
  return row.qty != null && normalizeUnit(row.unit) === normalizeUnit(blend.yieldUnit) ? row.qty / blend.servings : 1;
}

const identity = (line: { blendSlug: string | null; productSlug: string | null; name: string }) =>
  line.blendSlug ?? line.productSlug ?? normalizeName(line.name);

/**
 * Turn recipe ingredients into shopping lines scaled by `factor`.
 * Blends chosen as "scratch" are replaced by their own ingredients, recursively.
 */
export function expandIngredients(
  ingredients: IngredientRow[],
  blends: Map<string, BlendRecipe>,
  choices: Record<string, BlendChoice>,
  factor: number,
): ShoppingLine[] {
  const out: ShoppingLine[] = [];

  const walk = (rows: IngredientRow[], scale: number, via: string[], seen: Set<string>) => {
    for (const row of rows) {
      const blend = row.blendSlug ? blends.get(row.blendSlug) : undefined;
      if (blend && choices[blend.slug] === "scratch" && !seen.has(blend.slug)) {
        walk(blend.ingredients, scale * batchesFor(row, blend), [...via, blend.title], new Set([...seen, blend.slug]));
        continue;
      }
      const unit = normalizeUnit(row.unit);
      out.push({
        key: `${identity(row)}|${unit ?? ""}`,
        name: row.name,
        qty: row.qty == null ? null : roundQty(row.qty * scale, unit),
        unit,
        productSlug: row.productSlug,
        blendSlug: row.blendSlug,
        optional: row.optional,
        pantry: row.pantry,
        imageUrl: row.imageUrl,
        via,
        density: row.density ?? null,
      });
    }
  };

  walk(ingredients, factor, [], new Set());
  return mergeLines(out);
}

function mergeLines(lines: ShoppingLine[]): ShoppingLine[] {
  const merged: ShoppingLine[] = [];
  for (const line of lines) {
    const id = identity(line);
    const existing = merged.find((m) => identity(m) === id);
    const sum = existing ? addQuantities(existing, line) : null;
    if (existing && sum) {
      existing.qty = sum.qty;
      existing.unit = sum.unit;
      existing.optional = existing.optional && line.optional;
      existing.pantry = existing.pantry && line.pantry;
      existing.imageUrl ??= line.imageUrl;
      existing.via = [...new Set([...existing.via, ...line.via])];
      existing.key = `${id}|${sum.unit ?? ""}`;
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

export type BlendTreeLeaf = { name: string; qty: number | null; unit: string | null; productSlug: string | null; imageUrl: string | null; density?: number | null };
export type BlendTreeNode = { slug: string; title: string; children: (BlendTreeNode | BlendTreeLeaf)[] };

/**
 * Blend dependency tree for display, with quantities for `batches` batches of the blend
 * (nested blends are scaled by how much of them each batch uses).
 */
export function blendTree(slug: string, blends: Map<string, BlendRecipe>, batches = 1, seen = new Set<string>()): BlendTreeNode | null {
  const blend = blends.get(slug);
  if (!blend || seen.has(slug)) return null;
  const next = new Set([...seen, slug]);
  return {
    slug,
    title: blend.title,
    children: blend.ingredients.map((i) => {
      const nested = i.blendSlug ? blends.get(i.blendSlug) : undefined;
      const unit = normalizeUnit(i.unit);
      return (
        (nested && blendTree(nested.slug, blends, batches * batchesFor(i, nested), next)) || {
          name: i.name,
          qty: i.qty == null ? null : roundQty(i.qty * batches, unit),
          unit,
          productSlug: i.productSlug,
          imageUrl: i.imageUrl,
          density: i.density ?? null,
        }
      );
    }),
  };
}

/** Shopping lines for several recipes at once (e.g. a week of dinners), merged across recipes. */
export function expandRecipes(
  recipes: { ingredients: IngredientRow[]; factor: number }[],
  blends: Map<string, BlendRecipe>,
  choices: Record<string, BlendChoice>,
): ShoppingLine[] {
  return mergeLines(recipes.flatMap((r) => expandIngredients(r.ingredients, blends, choices, r.factor)));
}

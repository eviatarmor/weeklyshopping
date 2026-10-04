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
};

export type BlendChoice = "buy" | "scratch";

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
        // How many batches of the blend this line asks for.
        const batches =
          row.qty != null && normalizeUnit(row.unit) === normalizeUnit(blend.yieldUnit) ? row.qty / blend.servings : 1;
        walk(blend.ingredients, scale * batches, [...via, blend.title], new Set([...seen, blend.slug]));
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

export type BlendTreeNode = { slug: string; title: string; children: (BlendTreeNode | { name: string })[] };

/** Blend dependency tree for display. */
export function blendTree(slug: string, blends: Map<string, BlendRecipe>, seen = new Set<string>()): BlendTreeNode | null {
  const blend = blends.get(slug);
  if (!blend || seen.has(slug)) return null;
  const next = new Set([...seen, slug]);
  return {
    slug,
    title: blend.title,
    children: blend.ingredients.map((i) => (i.blendSlug && blendTree(i.blendSlug, blends, next)) || { name: i.name }),
  };
}

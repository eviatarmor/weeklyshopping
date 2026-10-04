import { eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_SECTIONS } from "@/shared/sections";
import { normalizeUnit } from "@/shared/units";
import type { Context } from "./trpc";
import { meta, products, recipeIngredients, recipes, sections } from "./db/schema";
import type { Content, HashedRecipe } from "./content";

type DB = Context["db"];

/** DO SQLite allows at most 100 bound parameters per statement. */
export function chunk<T>(rows: T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(100 / columns));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export function ensureSections(db: DB) {
  const existing = new Set(db.select({ id: sections.id }).from(sections).all().map((s) => s.id));
  const max = existing.size;
  DEFAULT_SECTIONS.forEach((s, i) => {
    if (existing.has(s.id)) return;
    db.insert(sections).values({ ...s, sortOrder: max + i }).run();
  });
}

/** ON CONFLICT DO UPDATE: take every column from the incoming row. */
const EXCLUDED_RECIPE_COLUMNS = Object.fromEntries(
  ["kind", "title", "subtitle", "description", "image_url", "source_url", "servings", "yield_unit", "prep_minutes", "tags", "steps", "added_at", "content_hash"].map(
    (column) => [column.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()), sql.raw(`excluded.${column}`)],
  ),
);

function recipeRow(r: HashedRecipe) {
  return {
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
    tags: r.tags,
    steps: r.steps,
    addedAt: r.addedAt,
    contentHash: r.hash,
  };
}

function ingredientRows(r: HashedRecipe) {
  return r.ingredients.map((i, position) => ({
    recipeSlug: r.slug,
    position,
    name: i.name,
    qty: i.qty ?? null,
    unit: normalizeUnit(i.unit),
    productSlug: i.product ?? null,
    blendSlug: i.blend ?? null,
    optional: i.optional ?? false,
    pantry: i.pantry ?? false,
    imageUrl: i.imageUrl ?? null,
  }));
}

export type SyncResult = { catalog: boolean; upserted: number; deleted: number };

/**
 * Bring catalog and recipe tables in line with bundled content. Only recipes whose
 * JSON changed are rewritten, which keeps Durable Object row writes low. User data
 * (list, ratings, history) keys on slugs and is untouched.
 */
export function syncContent(db: DB, content: Content): SyncResult {
  const result: SyncResult = { catalog: false, upserted: 0, deleted: 0 };
  const current = db.select().from(meta).where(eq(meta.key, "catalog_hash")).get();

  db.transaction((tx) => {
    if (current?.value !== content.catalogHash) {
      tx.delete(products).run();
      for (const rows of chunk(content.catalog, 5)) {
        tx.insert(products)
          .values(rows.map((p) => ({ slug: p.slug, name: p.name, aliases: p.aliases, sectionId: p.section, imageUrl: p.imageUrl ?? null })))
          .run();
      }
      tx.insert(meta)
        .values({ key: "catalog_hash", value: content.catalogHash })
        .onConflictDoUpdate({ target: meta.key, set: { value: content.catalogHash } })
        .run();
      result.catalog = true;
    }

    const existing = new Map(tx.select({ slug: recipes.slug, hash: recipes.contentHash }).from(recipes).all().map((r) => [r.slug, r.hash]));
    const wanted = new Set(content.recipes.map((r) => r.slug));
    const changed = content.recipes.filter((r) => existing.get(r.slug) !== r.hash);
    const removed = [...existing.keys()].filter((slug) => !wanted.has(slug));

    const stale = [...removed, ...changed.map((r) => r.slug).filter((s) => existing.has(s))];
    for (const slugs of chunk(stale, 1)) {
      tx.delete(recipeIngredients).where(inArray(recipeIngredients.recipeSlug, slugs)).run();
    }
    for (const slugs of chunk(removed, 1)) tx.delete(recipes).where(inArray(recipes.slug, slugs)).run();

    for (const rows of chunk(changed, 14)) {
      tx.insert(recipes)
        .values(rows.map(recipeRow))
        .onConflictDoUpdate({
          target: recipes.slug,
          set: EXCLUDED_RECIPE_COLUMNS,
        })
        .run();
    }
    for (const rows of chunk(changed.flatMap(ingredientRows), 10)) tx.insert(recipeIngredients).values(rows).run();

    result.upserted = changed.length;
    result.deleted = removed.length;
  });
  return result;
}

import { and, eq, inArray, sql } from "drizzle-orm";
import { classify } from "@/shared/classify";
import { capitalize, normalizeName } from "@/shared/normalize";
import { addQuantities, normalizeUnit } from "@/shared/units";
import type { ListItem } from "@/shared/types";
import type { Context, User } from "./trpc";
import { itemHistory, listItems } from "./db/schema";
import type { ContentStore } from "./content-store";

type DB = Context["db"];

export type AddItemInput = {
  /** Client-generated id so optimistic rows can be reconciled. */
  id?: string;
  name: string;
  qty?: number | null;
  unit?: string | null;
  productSlug?: string | null;
  imageUrl?: string | null;
  sectionId?: string | null;
  note?: string | null;
  sourceRecipeSlug?: string | null;
};


export function toListItem(row: typeof listItems.$inferSelect): ListItem {
  return {
    id: row.id,
    name: row.name,
    qty: row.qty,
    unit: row.unit,
    sectionId: row.sectionId,
    productSlug: row.productSlug,
    imageUrl: row.imageUrl,
    checked: row.checked,
    note: row.note,
    sourceRecipeSlug: row.sourceRecipeSlug,
    addedBy: row.addedBy,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Add items to the list. An unchecked item with the same name absorbs the new
 * quantity when units are compatible; otherwise a new row is created.
 */
export function addItems(db: DB, user: User, store: ContentStore, inputs: AddItemInput[]): ListItem[] {
  const { productIndex: index, productBySlug: bySlug } = store;
  const touched = new Map<string, ListItem>();
  const now = Date.now();

  db.transaction((tx) => {
    for (const input of inputs) {
      const name = capitalize(input.name);
      if (!name) continue;
      const normalized = normalizeName(name);
      const unit = normalizeUnit(input.unit);
      const qty = input.qty ?? null;

      const history = tx.select().from(itemHistory).where(eq(itemHistory.normalizedName, normalized)).get();
      const historySections = new Map<string, string>();
      if (history?.sectionOverride) historySections.set(normalized, history.sectionId);
      const classified = classify({ name, historySections, productIndex: index });
      const product = input.productSlug ? bySlug.get(input.productSlug) : undefined;
      const productSlug = product?.slug ?? classified.productSlug;
      const sectionId =
        input.sectionId ?? (history?.sectionOverride ? history.sectionId : (product?.sectionId ?? classified.sectionId));

      const existing = tx
        .select()
        .from(listItems)
        .where(and(eq(listItems.normalizedName, normalized), eq(listItems.checked, false)))
        .all();
      const mergeTarget = existing
        .map((row) => ({ row, sum: addQuantities(row, { qty, unit }) }))
        .find((m) => m.sum !== null);

      let row: typeof listItems.$inferSelect | undefined;
      if (mergeTarget?.sum) {
        row = tx
          .update(listItems)
          .set({
            qty: mergeTarget.sum.qty,
            unit: mergeTarget.sum.unit,
            note: input.note ?? mergeTarget.row.note,
            version: sql`${listItems.version} + 1`,
            updatedAt: now,
          })
          .where(eq(listItems.id, mergeTarget.row.id))
          .returning()
          .get();
      } else {
        row = tx
          .insert(listItems)
          .values({
            id: input.id ?? crypto.randomUUID(),
            name,
            normalizedName: normalized,
            qty,
            unit,
            sectionId,
            productSlug: productSlug ?? null,
            imageUrl: input.imageUrl ?? null,
            note: input.note ?? null,
            sourceRecipeSlug: input.sourceRecipeSlug ?? null,
            addedBy: user.email,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
      }
      if (row) touched.set(row.id, toListItem(row));

      tx.insert(itemHistory)
        .values({ normalizedName: normalized, displayName: name, productSlug: productSlug ?? null, sectionId, useCount: 1, lastUsedAt: now })
        .onConflictDoUpdate({
          target: itemHistory.normalizedName,
          set: {
            displayName: name,
            productSlug: productSlug ?? null,
            useCount: sql`${itemHistory.useCount} + 1`,
            lastUsedAt: now,
            usuallyHave: false,
          },
        })
        .run();
    }
  });

  return [...touched.values()];
}

export type ItemPatch = {
  name?: string;
  qty?: number | null;
  unit?: string | null;
  sectionId?: string;
  checked?: boolean;
  note?: string | null;
};

export function updateItem(db: DB, id: string, patch: ItemPatch): ListItem | null {
  return db.transaction((tx) => {
    const current = tx.select().from(listItems).where(eq(listItems.id, id)).get();
    if (!current) return null;
    const name = patch.name !== undefined ? capitalize(patch.name) : current.name;
    const normalized = normalizeName(name);
    const row = tx
      .update(listItems)
      .set({
        name,
        normalizedName: normalized,
        qty: patch.qty !== undefined ? patch.qty : current.qty,
        unit: patch.unit !== undefined ? normalizeUnit(patch.unit) : current.unit,
        sectionId: patch.sectionId ?? current.sectionId,
        checked: patch.checked ?? current.checked,
        note: patch.note !== undefined ? patch.note : current.note,
        version: current.version + 1,
        updatedAt: Date.now(),
      })
      .where(eq(listItems.id, id))
      .returning()
      .get();

    // Moving an item by hand teaches the household where it belongs.
    if (patch.sectionId && patch.sectionId !== current.sectionId) {
      tx.insert(itemHistory)
        .values({ normalizedName: normalized, displayName: name, productSlug: current.productSlug, sectionId: patch.sectionId, sectionOverride: true })
        .onConflictDoUpdate({ target: itemHistory.normalizedName, set: { sectionId: patch.sectionId, sectionOverride: true } })
        .run();
    }
    return row ? toListItem(row) : null;
  });
}

export function removeItems(db: DB, ids: string[]): string[] {
  if (ids.length === 0) return [];
  return db.delete(listItems).where(inArray(listItems.id, ids)).returning({ id: listItems.id }).all().map((r) => r.id);
}

export function clearChecked(db: DB): string[] {
  return db.delete(listItems).where(eq(listItems.checked, true)).returning({ id: listItems.id }).all().map((r) => r.id);
}

/** Remember which ingredients the household usually has at home. */
export function setUsuallyHave(db: DB, entries: { name: string; productSlug: string | null; have: boolean }[], store: ContentStore) {
  const index = store.productIndex;
  db.transaction((tx) => {
    for (const entry of entries) {
      const name = capitalize(entry.name);
      const normalized = normalizeName(name);
      const existing = tx.select().from(itemHistory).where(eq(itemHistory.normalizedName, normalized)).get();
      if (existing) {
        tx.update(itemHistory).set({ usuallyHave: entry.have }).where(eq(itemHistory.normalizedName, normalized)).run();
      } else if (entry.have) {
        const classified = classify({ name, historySections: new Map(), productIndex: index });
        tx.insert(itemHistory)
          .values({
            normalizedName: normalized,
            displayName: name,
            productSlug: entry.productSlug ?? classified.productSlug,
            sectionId: classified.sectionId,
            useCount: 0,
            usuallyHave: true,
          })
          .run();
      }
    }
  });
}

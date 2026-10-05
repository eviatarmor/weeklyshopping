import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeName } from "@/shared/normalize";
import { weekStartOf } from "@/shared/week";
import { protectedProcedure, router } from "../trpc";
import { kitchenItems, listItems, recipeNotes, regularItems } from "../db/schema";
import { addItems } from "../list-service";

/** Shared household bits: recipe notes, items bought every week, and what's in the kitchen. */
export const householdRouter = router({
  // ----- Recipe notes -----
  note: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db.select().from(recipeNotes).where(eq(recipeNotes.recipeSlug, input.slug)).get();
    if (!row) return null;
    const name = ctx.household.members.find((m) => m.email === row.updatedBy)?.name ?? row.updatedBy;
    return { text: row.text, updatedBy: name, updatedAt: row.updatedAt };
  }),

  setNote: protectedProcedure.input(z.object({ slug: z.string(), text: z.string().max(2000) })).mutation(({ ctx, input }) => {
    const text = input.text.trim();
    if (!text) ctx.db.delete(recipeNotes).where(eq(recipeNotes.recipeSlug, input.slug)).run();
    else {
      const set = { text, updatedBy: ctx.user.email, updatedAt: Date.now() };
      ctx.db.insert(recipeNotes).values({ recipeSlug: input.slug, ...set }).onConflictDoUpdate({ target: recipeNotes.recipeSlug, set }).run();
    }
    ctx.bus.emit({ type: "note.changed", slug: input.slug });
  }),

  // ----- Regular items -----
  regulars: protectedProcedure.query(({ ctx }) => ctx.db.select().from(regularItems).orderBy(asc(regularItems.name)).all()),

  setRegular: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        regular: z.boolean(),
        qty: z.number().positive().nullish(),
        unit: z.string().max(20).nullish(),
        sectionId: z.string().max(40).nullish(),
        productSlug: z.string().max(80).nullish(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const key = normalizeName(input.name);
      if (!input.regular) ctx.db.delete(regularItems).where(eq(regularItems.normalizedName, key)).run();
      else {
        // It's on the list now, so this week is already covered.
        const values = { name: input.name, qty: input.qty ?? null, unit: input.unit ?? null, sectionId: input.sectionId ?? null, productSlug: input.productSlug ?? null };
        ctx.db
          .insert(regularItems)
          .values({ normalizedName: key, ...values, lastAddedWeek: weekStartOf(new Date()) })
          .onConflictDoUpdate({ target: regularItems.normalizedName, set: values })
          .run();
      }
      ctx.bus.emit({ type: "regulars.changed" });
    }),

  /** Put this week's regular items on the list (once a week; skips ones already there). */
  addRegulars: protectedProcedure.mutation(({ ctx }) => {
    const week = weekStartOf(new Date());
    const due = ctx.db.select().from(regularItems).all().filter((r) => r.lastAddedWeek !== week);
    if (due.length === 0) return { added: 0 };
    const onList = new Set(
      ctx.db
        .select({ name: listItems.normalizedName, checked: listItems.checked })
        .from(listItems)
        .all()
        .filter((i) => !i.checked)
        .map((i) => i.name),
    );
    const items = addItems(
      ctx.db,
      ctx.user,
      ctx.store,
      due.filter((r) => !onList.has(r.normalizedName)).map((r) => ({ name: r.name, qty: r.qty, unit: r.unit, sectionId: r.sectionId, productSlug: r.productSlug })),
    );
    ctx.db.transaction((tx) => {
      for (const r of due) tx.update(regularItems).set({ lastAddedWeek: week }).where(eq(regularItems.normalizedName, r.normalizedName)).run();
    });
    if (items.length) ctx.bus.emit({ type: "items.upsert", items });
    return { added: items.length };
  }),

  // ----- Kitchen -----
  kitchen: protectedProcedure.query(({ ctx }) => ctx.db.select().from(kitchenItems).orderBy(asc(kitchenItems.name)).all()),

  addToKitchen: protectedProcedure.input(z.object({ names: z.array(z.string().trim().min(1).max(120)).max(200) })).mutation(({ ctx, input }) => {
    ctx.db.transaction((tx) => {
      for (const name of input.names) {
        tx.insert(kitchenItems).values({ normalizedName: normalizeName(name), name, addedAt: Date.now() }).onConflictDoNothing().run();
      }
    });
    ctx.bus.emit({ type: "kitchen.changed" });
  }),

  removeFromKitchen: protectedProcedure.input(z.object({ names: z.array(z.string().max(120)).max(500) })).mutation(({ ctx, input }) => {
    ctx.db.transaction((tx) => {
      for (const name of input.names) tx.delete(kitchenItems).where(eq(kitchenItems.normalizedName, normalizeName(name))).run();
    });
    ctx.bus.emit({ type: "kitchen.changed" });
  }),
});

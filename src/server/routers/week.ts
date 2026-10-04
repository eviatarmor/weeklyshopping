import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { WEEK_START } from "@/shared/week";
import { protectedProcedure, router } from "../trpc";
import { mealPlan, recipeCooked } from "../db/schema";
import { addItems, setUsuallyHave } from "../list-service";

const weekStart = z.string().regex(WEEK_START);
/** 0 = Monday … 6 = Sunday; null = "sometime this week". */
const day = z.number().int().min(0).max(6).nullable();
const servings = z.number().int().min(1).max(12);

export type PlannedMeal = typeof mealPlan.$inferSelect;

const shoppingLine = z.object({
  name: z.string().min(1).max(120),
  qty: z.number().positive().nullable(),
  unit: z.string().nullable(),
  productSlug: z.string().nullable(),
  imageUrl: z.string().nullable(),
  have: z.boolean(),
});

/** The week's dinners. Every change is broadcast so both phones stay in sync. */
export const weekRouter = router({
  get: protectedProcedure
    .input(z.object({ weekStart }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(mealPlan).where(eq(mealPlan.weekStart, input.weekStart)).orderBy(asc(mealPlan.position)).all(),
    ),

  add: protectedProcedure
    .input(
      z
        .object({
          weekStart,
          day,
          recipeSlug: z.string().max(200).optional(),
          customName: z.string().trim().min(1).max(120).optional(),
          servings: servings.default(2),
        })
        .refine((v) => Boolean(v.recipeSlug) !== Boolean(v.customName), "Pick a recipe or type a name"),
    )
    .mutation(({ ctx, input }) => {
      if (input.recipeSlug && !ctx.store.bySlug.has(input.recipeSlug)) throw new TRPCError({ code: "NOT_FOUND" });
      const row = ctx.db
        .insert(mealPlan)
        .values({
          id: crypto.randomUUID(),
          weekStart: input.weekStart,
          day: input.day,
          position: Date.now(),
          recipeSlug: input.recipeSlug ?? null,
          customName: input.customName ?? null,
          servings: input.servings,
          addedBy: ctx.user.email,
        })
        .returning()
        .get();
      ctx.bus.emit({ type: "week.changed", weekStart: input.weekStart });
      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        patch: z.object({ weekStart: weekStart.optional(), day: day.optional(), servings: servings.optional() }),
      }),
    )
    .mutation(({ ctx, input }) => {
      const before = ctx.db.select().from(mealPlan).where(eq(mealPlan.id, input.id)).get();
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      // A moved meal goes to the end of its new day.
      const moved = input.patch.day !== undefined || input.patch.weekStart !== undefined;
      const row = ctx.db
        .update(mealPlan)
        .set({ ...input.patch, ...(moved ? { position: Date.now() } : {}) })
        .where(eq(mealPlan.id, input.id))
        .returning()
        .get();
      ctx.bus.emit({ type: "week.changed", weekStart: before.weekStart });
      if (row.weekStart !== before.weekStart) ctx.bus.emit({ type: "week.changed", weekStart: row.weekStart });
      return row;
    }),

  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const row = ctx.db.delete(mealPlan).where(eq(mealPlan.id, input.id)).returning().get();
    if (row) ctx.bus.emit({ type: "week.changed", weekStart: row.weekStart });
  }),

  /** Tick a dinner as cooked (or untick it). Recipes also go into the cooked history. */
  setCooked: protectedProcedure.input(z.object({ id: z.string(), cooked: z.boolean() })).mutation(({ ctx, input }) => {
    const before = ctx.db.select().from(mealPlan).where(eq(mealPlan.id, input.id)).get();
    if (!before) throw new TRPCError({ code: "NOT_FOUND" });
    if (Boolean(before.cookedAt) === input.cooked) return before;
    const cookedAt = input.cooked ? Date.now() : null;
    const row = ctx.db.update(mealPlan).set({ cookedAt }).where(eq(mealPlan.id, input.id)).returning().get();
    if (before.recipeSlug) {
      if (cookedAt) ctx.db.insert(recipeCooked).values({ recipeSlug: before.recipeSlug, userEmail: ctx.user.email, cookedAt }).run();
      else if (before.cookedAt)
        ctx.db.delete(recipeCooked).where(and(eq(recipeCooked.recipeSlug, before.recipeSlug), eq(recipeCooked.cookedAt, before.cookedAt))).run();
    }
    ctx.bus.emit({ type: "week.changed", weekStart: row.weekStart });
    return row;
  }),

  /** Add the combined ingredients of several planned dinners and mark those dinners as on the list. */
  addToList: protectedProcedure
    .input(z.object({ weekStart, mealIds: z.array(z.string()).min(1).max(50), lines: z.array(shoppingLine).max(500) }))
    .mutation(({ ctx, input }) => {
      const needed = input.lines.filter((l) => !l.have);
      const items = addItems(
        ctx.db,
        ctx.user,
        ctx.store,
        needed.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, productSlug: l.productSlug, imageUrl: l.imageUrl })),
      );
      setUsuallyHave(
        ctx.db,
        input.lines.map((l) => ({ name: l.name, productSlug: l.productSlug, have: l.have })),
        ctx.store,
      );
      const now = Date.now();
      ctx.db.transaction((tx) => {
        for (const id of input.mealIds) tx.update(mealPlan).set({ onListAt: now }).where(eq(mealPlan.id, id)).run();
      });
      if (items.length) ctx.bus.emit({ type: "items.upsert", items });
      ctx.bus.emit({ type: "history.changed" });
      ctx.bus.emit({ type: "week.changed", weekStart: input.weekStart });
      return { added: items.length, skipped: input.lines.length - needed.length };
    }),
});

import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { itemHistory, sections } from "../db/schema";

export const catalogRouter = router({
  /** Everything autocomplete needs; filtered on the client. */
  get: protectedProcedure.query(({ ctx }) => ({
    sections: ctx.db.select().from(sections).orderBy(asc(sections.sortOrder)).all(),
    products: ctx.store.products,
    history: ctx.db.select().from(itemHistory).all(),
  })),

  reorderSections: protectedProcedure.input(z.object({ ids: z.array(z.string()).max(50) })).mutation(({ ctx, input }) => {
    ctx.db.transaction((tx) => {
      input.ids.forEach((id, sortOrder) => tx.update(sections).set({ sortOrder }).where(eq(sections.id, id)).run());
    });
    ctx.bus.emit({ type: "sections.changed" });
  }),

  /** Drop a past item from autocomplete suggestions. */
  forget: protectedProcedure.input(z.object({ normalizedName: z.string() })).mutation(({ ctx, input }) => {
    ctx.db.delete(itemHistory).where(eq(itemHistory.normalizedName, input.normalizedName)).run();
    ctx.bus.emit({ type: "history.changed" });
  }),
});

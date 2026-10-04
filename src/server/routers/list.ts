import { asc } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { listItems } from "../db/schema";
import { addItems, clearChecked, removeItems, toListItem, updateItem } from "../list-service";

const qty = z.number().positive().max(100_000).nullish();
const unit = z.string().max(20).nullish();

export const addItemSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  qty,
  unit,
  productSlug: z.string().max(80).nullish(),
  sectionId: z.string().max(40).nullish(),
  note: z.string().max(200).nullish(),
});

export const listRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(listItems).orderBy(asc(listItems.createdAt)).all().map(toListItem),
  ),

  add: protectedProcedure.input(addItemSchema).mutation(({ ctx, input }) => {
    const items = addItems(ctx.db, ctx.user, ctx.contentHash, [input]);
    if (items.length) ctx.bus.emit({ type: "items.upsert", items });
    ctx.bus.emit({ type: "history.changed" });
    return items;
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        patch: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          qty,
          unit,
          sectionId: z.string().max(40).optional(),
          checked: z.boolean().optional(),
          note: z.string().max(200).nullish(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => {
      const item = updateItem(ctx.db, input.id, input.patch);
      if (item) ctx.bus.emit({ type: "items.upsert", items: [item] });
      if (input.patch.sectionId) ctx.bus.emit({ type: "history.changed" });
      return item;
    }),

  remove: protectedProcedure.input(z.object({ ids: z.array(z.string()).max(500) })).mutation(({ ctx, input }) => {
    const ids = removeItems(ctx.db, input.ids);
    if (ids.length) ctx.bus.emit({ type: "items.delete", ids });
    return ids;
  }),

  clearChecked: protectedProcedure.mutation(({ ctx }) => {
    const ids = clearChecked(ctx.db);
    if (ids.length) ctx.bus.emit({ type: "items.delete", ids });
    return ids;
  }),

  onChange: protectedProcedure.subscription(async function* ({ ctx, signal }) {
    yield* ctx.bus.subscribe(signal);
  }),
});

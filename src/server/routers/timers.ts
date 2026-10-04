import { asc, eq, gt, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { pushSubscriptions, timers } from "../db/schema";
import { rememberOrigin } from "../timers-service";

/** Finished timers stay on screen this long (or until dismissed). */
const KEEP_FINISHED_MS = 30 * 60_000;

export type CookingTimer = typeof timers.$inferSelect;

/** Kitchen timers shared by the household; the Durable Object alarm sends a notification when one is up. */
export const timersRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(timers)
      .where(or(isNull(timers.firedAt), gt(timers.firedAt, Date.now() - KEEP_FINISHED_MS)))
      .orderBy(asc(timers.endsAt))
      .all(),
  ),

  start: protectedProcedure
    .input(z.object({ recipeSlug: z.string().max(200).nullish(), label: z.string().trim().min(1).max(80), seconds: z.number().int().min(5).max(12 * 3600) }))
    .mutation(async ({ ctx, input }) => {
      const row = ctx.db
        .insert(timers)
        .values({
          id: crypto.randomUUID(),
          recipeSlug: input.recipeSlug ?? null,
          label: input.label,
          durationSeconds: input.seconds,
          endsAt: Date.now() + input.seconds * 1000,
          startedBy: ctx.user.email,
        })
        .returning()
        .get();
      await ctx.syncAlarm();
      ctx.bus.emit({ type: "timers.changed" });
      return row;
    }),

  /** Add time to a running or finished timer ("+1 min"). */
  extend: protectedProcedure.input(z.object({ id: z.string(), seconds: z.number().int().min(5).max(3600) })).mutation(async ({ ctx, input }) => {
    const timer = ctx.db.select().from(timers).where(eq(timers.id, input.id)).get();
    if (!timer) throw new TRPCError({ code: "NOT_FOUND" });
    const from = timer.firedAt ? Date.now() : timer.endsAt;
    ctx.db.update(timers).set({ endsAt: from + input.seconds * 1000, firedAt: null }).where(eq(timers.id, input.id)).run();
    await ctx.syncAlarm();
    ctx.bus.emit({ type: "timers.changed" });
  }),

  /** Stop a running timer, or clear a finished one. */
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    ctx.db.delete(timers).where(eq(timers.id, input.id)).run();
    await ctx.syncAlarm();
    ctx.bus.emit({ type: "timers.changed" });
  }),

  /** The key the browser needs to subscribe this phone to notifications. */
  pushKey: protectedProcedure.query(({ ctx }) => ctx.vapidPublicKey || null),

  subscribe: protectedProcedure
    .input(z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }))
    .mutation(({ ctx, input }) => {
      if (!input.endpoint.startsWith("https://")) throw new TRPCError({ code: "BAD_REQUEST" });
      const values = { endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userEmail: ctx.user.email };
      ctx.db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values }).run();
      rememberOrigin(ctx.db, ctx.origin);
    }),

  unsubscribe: protectedProcedure.input(z.object({ endpoint: z.string().max(1000) })).mutation(({ ctx, input }) => {
    ctx.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint)).run();
  }),
});

import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { Context } from "./trpc";
import type { EventBus } from "./bus";
import type { ContentStore } from "./content-store";
import { meta, pushSubscriptions, timers } from "./db/schema";
import { sendPush, type Vapid } from "./web-push";

type DB = Context["db"];

/** When the next running timer is due, or null when none are running. */
export function nextTimerDue(db: DB): number | null {
  const next = db.select({ endsAt: timers.endsAt }).from(timers).where(isNull(timers.firedAt)).orderBy(asc(timers.endsAt)).limit(1).get();
  return next?.endsAt ?? null;
}

/** The app's address, remembered from requests so pushes can link back to it. */
export function rememberOrigin(db: DB, origin: string) {
  const current = db.select().from(meta).where(eq(meta.key, "origin")).get();
  if (current?.value !== origin) db.insert(meta).values({ key: "origin", value: origin }).onConflictDoUpdate({ target: meta.key, set: { value: origin } }).run();
}

/** Mark every timer that's due as fired and notify every subscribed phone. */
export async function fireDueTimers(db: DB, bus: EventBus, store: ContentStore, vapid: Omit<Vapid, "subject"> | null) {
  const due = db.select().from(timers).where(and(isNull(timers.firedAt), lte(timers.endsAt, Date.now() + 500))).all();
  if (due.length === 0) return;
  const firedAt = Date.now();
  db.transaction((tx) => {
    for (const t of due) tx.update(timers).set({ firedAt }).where(eq(timers.id, t.id)).run();
  });
  bus.emit({ type: "timers.changed" });

  if (!vapid) return;
  const origin = db.select().from(meta).where(eq(meta.key, "origin")).get()?.value ?? "https://example.invalid";
  const subscriptions = db.select().from(pushSubscriptions).all();
  for (const t of due) {
    const recipe = t.recipeSlug ? store.bySlug.get(t.recipeSlug) : undefined;
    const message = {
      title: `⏰ Time's up: ${t.label}`,
      body: recipe ? recipe.title : "Your timer is done",
      tag: `timer-${t.id}`,
      url: recipe ? `/recipes/${recipe.slug}` : "/",
    };
    const results = await Promise.all(subscriptions.map((s) => sendPush(s, message, { ...vapid, subject: origin })));
    // Phones that unsubscribed or uninstalled the app.
    results.forEach((result, i) => {
      if (result === "gone") db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscriptions[i]!.endpoint)).run();
    });
  }
}

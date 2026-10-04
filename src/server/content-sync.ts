import { DEFAULT_SECTIONS } from "@/shared/sections";
import type { Context } from "./trpc";
import { sections } from "./db/schema";

type DB = Context["db"];

/** Add any default supermarket sections the household doesn't have yet (first run, or new defaults). */
export function ensureSections(db: DB) {
  const existing = new Set(db.select({ id: sections.id }).from(sections).all().map((s) => s.id));
  const max = existing.size;
  DEFAULT_SECTIONS.forEach((s, i) => {
    if (existing.has(s.id)) return;
    db.insert(sections).values({ ...s, sortOrder: max + i }).run();
  });
}

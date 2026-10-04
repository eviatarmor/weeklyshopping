import { normalizeName } from "@/shared/normalize";
import type { Catalog } from "./use-list";

export type Suggestion = {
  key: string;
  name: string;
  productSlug: string | null;
  sectionId: string;
  imageUrl: string | null;
  fromHistory: boolean;
};

const DAY = 86_400_000;

function matchScore(candidate: string, query: string): number {
  if (!query) return 0;
  if (candidate === query) return 100;
  if (candidate.startsWith(query)) return 80;
  if (candidate.split(" ").some((word) => word.startsWith(query))) return 60;
  if (query.length >= 4 && candidate.includes(query)) return 35;
  return 0;
}

/**
 * Rank past items and catalog products for the typed text. Past items get a
 * boost by how often and how recently they were added.
 */
export function suggest(query: string, catalog: Catalog | undefined, onList: Set<string>, limit = 8): Suggestion[] {
  if (!catalog) return [];
  const q = normalizeName(query);
  const products = new Map(catalog.products.map((p) => [p.slug, p]));
  const scored = new Map<string, { s: Suggestion; score: number }>();

  const offer = (key: string, s: Suggestion, score: number) => {
    const current = scored.get(key);
    if (!current || current.score < score) scored.set(key, { s, score });
  };

  for (const h of catalog.history) {
    if (h.useCount === 0) continue;
    const base = q ? matchScore(h.normalizedName, q) : 50;
    if (!base) continue;
    const recency = Date.now() - h.lastUsedAt < 30 * DAY ? 8 : 0;
    const product = h.productSlug ? products.get(h.productSlug) : undefined;
    offer(
      h.productSlug ?? h.normalizedName,
      {
        key: h.normalizedName,
        name: h.displayName,
        productSlug: h.productSlug,
        sectionId: h.sectionOverride ? h.sectionId : (product?.sectionId ?? h.sectionId),
        imageUrl: product?.imageUrl ?? null,
        fromHistory: true,
      },
      base + Math.min(24, h.useCount * 3) + recency,
    );
  }

  if (q) {
    for (const p of catalog.products) {
      let best = matchScore(normalizeName(p.name), q);
      for (const alias of p.aliases) best = Math.max(best, matchScore(normalizeName(alias), q) * 0.85);
      if (!best) continue;
      offer(p.slug, { key: p.slug, name: p.name, productSlug: p.slug, sectionId: p.sectionId, imageUrl: p.imageUrl, fromHistory: false }, best);
    }
  }

  return [...scored.values()]
    .filter(({ s }) => q || !onList.has(normalizeName(s.name)))
    .sort((a, b) => b.score - a.score || a.s.name.length - b.s.name.length)
    .slice(0, limit)
    .map(({ s }) => s);
}

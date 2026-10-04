import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RecipeIndexEntry } from "@/shared/static-data";
import { useRecipeIndex } from "@/client/lib/static-data";
import { useTRPC, type RouterOutputs } from "@/client/lib/trpc";

type Stats = RouterOutputs["recipes"]["stats"][string];
export type RecipeCard = RecipeIndexEntry & Stats;

const NO_STATS: Stats = { avgStars: null, ratingCount: 0, myStars: null, timesCooked: 0, lastCookedAt: null };

/** Static recipe cards joined with this household's ratings and cooked counts. */
export function useRecipeCards() {
  const trpc = useTRPC();
  const index = useRecipeIndex();
  const stats = useQuery(trpc.recipes.stats.queryOptions(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false }));
  const cards = useMemo(
    () => (index.data ?? []).map((r): RecipeCard => ({ ...r, ...(stats.data?.[r.slug] ?? NO_STATS) })),
    [index.data, stats.data],
  );
  const bySlug = useMemo(() => new Map(cards.map((c) => [c.slug, c])), [cards]);
  return { cards, bySlug, isPending: index.isPending, error: index.error };
}

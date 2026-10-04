import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTRPC, type RouterOutputs } from "@/client/lib/trpc";

export type RecipeCard = RouterOutputs["recipes"]["list"]["items"][number];

/** Cards for a handful of specific recipes (week plan, list items), keyed by slug. */
export function useRecipeCardsFor(slugs: string[]) {
  const trpc = useTRPC();
  const unique = useMemo(() => [...new Set(slugs)].sort(), [slugs]);
  const query = useQuery(
    trpc.recipes.cards.queryOptions({ slugs: unique }, { enabled: unique.length > 0, staleTime: 5 * 60_000, placeholderData: keepPreviousData }),
  );
  const bySlug = useMemo(() => new Map((query.data ?? []).map((c) => [c.slug, c])), [query.data]);
  return { ...query, bySlug };
}

/** A recipe's content (ingredients, method, blends). It only changes with a deploy. */
export function useRecipeDetail(slug: string) {
  const trpc = useTRPC();
  return useQuery(trpc.recipes.content.queryOptions({ slug }, { staleTime: Infinity, refetchOnWindowFocus: false }));
}

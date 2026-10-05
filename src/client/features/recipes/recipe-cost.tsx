import { useEffect } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import type { IngredientRow } from "@/shared/expand";
import { useRecipeCardsFor } from "@/client/features/recipes/use-recipes";
import { useTRPC } from "@/client/lib/trpc";

/**
 * "≈ $4.20 per serve": what the ingredients you use cost at the best buy (pantry staples left out).
 * Opening a recipe looks up its ingredient prices, so the cost appears once they're in.
 */
export function RecipeCost({ slug, ingredients, people }: { slug: string; ingredients: IngredientRow[]; people: number }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { bySlug } = useRecipeCardsFor([slug]);
  const cost = bySlug.get(slug)?.costPerServe ?? null;
  const names = ingredients.filter((i) => !i.pantry && !i.optional && !i.blendSlug).map((i) => i.name);
  const prices = useQueries({
    queries: names.map((name) =>
      trpc.prices.compare.queryOptions({ name }, { staleTime: 6 * 60 * 60_000, retry: 1, refetchOnWindowFocus: false, enabled: cost == null }),
    ),
  });
  const loaded = prices.every((p) => !p.isPending);
  // Once the prices are in, ask the server for the cost again.
  useEffect(() => {
    if (cost == null && loaded && names.length) void qc.invalidateQueries({ queryKey: trpc.recipes.cards.queryKey() });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cost == null) {
    return !loaded ? (
      <span className="flex items-center gap-1 text-muted-foreground/70">
        <DollarSign className="size-4" /> working out cost…
      </span>
    ) : null;
  }
  return (
    <span className="flex items-center gap-1" title="What the ingredients you use cost at the cheapest store (estimate)">
      <DollarSign className="size-4" /> ≈ ${cost.toFixed(2)}/serve · ${(cost * people).toFixed(2)} for {people}
    </span>
  );
}

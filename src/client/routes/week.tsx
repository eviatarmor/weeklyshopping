import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { z } from "zod";
import { spoonStandardFor } from "@/shared/measure";
import { addDays, fromIsoDate, WEEK_START, weekStartOf } from "@/shared/week";
import { PageHeader } from "@/client/components/page-header";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/misc";
import { useCatalog } from "@/client/features/list/use-list";
import { ShoppingDrawer } from "@/client/features/recipes/add-to-list-drawer";
import { useRecipeCardsFor } from "@/client/features/recipes/use-recipes";
import { AddMealDrawer } from "@/client/features/week/add-meal-drawer";
import { MealCard } from "@/client/features/week/meal-card";
import { useWeek, useWeekActions, type PlannedMeal } from "@/client/features/week/use-week";
import { useMeasureSystem } from "@/client/lib/preferences";
import { useTRPC } from "@/client/lib/trpc";

export const Route = createFileRoute("/week")({
  validateSearch: z.object({ w: z.string().regex(WEEK_START).optional().catch(undefined) }),
  component: WeekPage,
});

const dateLabel = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });

function weekTitle(weekStart: string, thisWeek: string) {
  if (weekStart === thisWeek) return "This week";
  if (weekStart === addDays(thisWeek, 7)) return "Next week";
  if (weekStart === addDays(thisWeek, -7)) return "Last week";
  return `${dateLabel.format(fromIsoDate(weekStart))} – ${dateLabel.format(fromIsoDate(addDays(weekStart, 6)))}`;
}

/** The dinners for a week: no fixed days, just what you'll cook. Tick each one off once it's made. */
function WeekPage() {
  const navigate = Route.useNavigate();
  const thisWeek = weekStartOf(new Date());
  const weekStart = Route.useSearch().w ?? thisWeek;
  const goTo = (w: string) => void navigate({ search: { w: w === thisWeek ? undefined : w }, replace: true });

  const { data: meals, isPending } = useWeek(weekStart);
  const { bySlug } = useRecipeCardsFor(useMemo(() => (meals ?? []).flatMap((m) => m.recipeSlug ?? []), [meals]));
  const [adding, setAdding] = useState(false);
  const [shopping, setShopping] = useState(false);

  const toCook = (meals ?? []).filter((m) => m.cookedAt == null);
  const cooked = (meals ?? []).filter((m) => m.cookedAt != null).sort((a, b) => b.cookedAt! - a.cookedAt!);
  // Dinners whose ingredients aren't on the shopping list yet.
  const toShop = toCook.filter((m) => m.recipeSlug && m.onListAt == null);
  // Estimated cost of the week's dinners still to cook (recipes with a known cost per serve).
  const costed = toCook.filter((m) => m.recipeSlug && bySlug.get(m.recipeSlug)?.costPerServe != null);
  const weekCost = costed.reduce((sum, m) => sum + bySlug.get(m.recipeSlug!)!.costPerServe! * m.servings, 0);

  return (
    <div className="md:mx-auto md:max-w-3xl md:pt-4">
      <PageHeader
        title="Dinners"
        action={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => goTo(addDays(weekStart, -7))}>
              <ChevronLeft className="size-5" />
            </Button>
            <button type="button" onClick={() => goTo(thisWeek)} className="min-w-24 text-center text-sm font-semibold">
              {weekTitle(weekStart, thisWeek)}
            </button>
            <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => goTo(addDays(weekStart, 7))}>
              <ChevronRight className="size-5" />
            </Button>
          </div>
        }
      >
        <div className="flex items-center gap-2 px-4 pb-3 md:px-6">
          <Button className="flex-1" onClick={() => setAdding(true)}>
            <Plus /> Add dinner
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setShopping(true)} disabled={toShop.length === 0}>
            <ShoppingCart />
            {toShop.length === 0 ? (toCook.some((m) => m.onListAt != null) ? "All on the list" : "Add to list") : `Add ${toShop.length} to list`}
          </Button>
        </div>
        {costed.length > 0 && (
          <p className="px-4 pb-2 text-sm text-muted-foreground md:px-6">
            ≈ <span className="font-semibold text-foreground">${weekCost.toFixed(2)}</span> for {costed.length === toCook.length ? "these dinners" : `${costed.length} of ${toCook.length} dinners`}
          </p>
        )}
      </PageHeader>

      <div className="space-y-2 px-4 pt-1 pb-6 md:px-6">
        {isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        {toCook.map((m) => (
          <MealCard key={m.id} meal={m} recipe={m.recipeSlug ? bySlug.get(m.recipeSlug) : undefined} />
        ))}
        {!isPending && toCook.length === 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm text-muted-foreground active:bg-accent"
          >
            <span className="font-medium text-foreground">{cooked.length ? "All cooked!" : "Nothing planned yet"}</span>
            Add the dinners you want to make {weekStart === thisWeek ? "this week" : "that week"}
          </button>
        )}
        {cooked.length > 0 && (
          <>
            <h2 className="px-1 pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cooked · {cooked.length}</h2>
            {cooked.map((m) => (
              <MealCard key={m.id} meal={m} recipe={m.recipeSlug ? bySlug.get(m.recipeSlug) : undefined} />
            ))}
          </>
        )}
      </div>

      <AddMealDrawer open={adding} onOpenChange={setAdding} weekStart={weekStart} label={weekTitle(weekStart, thisWeek)} />
      {shopping && <WeekShoppingDrawer weekStart={weekStart} meals={toShop} onClose={() => setShopping(false)} />}
    </div>
  );
}

/** The combined ingredients of the dinners that aren't on the list yet. */
function WeekShoppingDrawer({ weekStart, meals, onClose }: { weekStart: string; meals: PlannedMeal[]; onClose: () => void }) {
  const trpc = useTRPC();
  const { addToList } = useWeekActions();
  const [system] = useMeasureSystem();
  const { historyByName } = useCatalog();
  const usuallyHave = useMemo(() => [...historyByName.values()].filter((h) => h.usuallyHave).map((h) => h.normalizedName), [historyByName]);
  const details = useQueries({
    queries: meals.map((m) => trpc.recipes.content.queryOptions({ slug: m.recipeSlug! }, { staleTime: Infinity })),
  });
  const recipes = useMemo(
    () => details.flatMap((d, i) => (d.data ? [{ detail: d.data, servings: meals[i]!.servings }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [details.map((d) => d.dataUpdatedAt).join(), meals],
  );
  if (recipes.length < meals.length) return null;
  return (
    <ShoppingDrawer
      recipes={recipes}
      usuallyHave={usuallyHave}
      open
      onOpenChange={(open) => !open && onClose()}
      system={system}
      standard={spoonStandardFor(recipes[0]?.detail.recipe.sourceUrl)}
      description={`Untick what's already in your kitchen. ${meals.length} dinner${meals.length === 1 ? "" : "s"}, combined.`}
      pending={addToList.isPending}
      submit={(lines) => addToList.mutateAsync({ weekStart, mealIds: meals.map((m) => m.id), lines })}
    />
  );
}

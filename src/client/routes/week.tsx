import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { z } from "zod";
import { spoonStandardFor } from "@/shared/measure";
import { addDays, DAY_NAMES, dayIndex, fromIsoDate, WEEK_START, weekStartOf } from "@/shared/week";
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
import { cn } from "@/client/lib/utils";

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

function WeekPage() {
  const navigate = Route.useNavigate();
  const thisWeek = weekStartOf(new Date());
  const weekStart = Route.useSearch().w ?? thisWeek;
  const goTo = (w: string) => void navigate({ search: { w: w === thisWeek ? undefined : w }, replace: true });

  const { data: meals, isPending } = useWeek(weekStart);
  const { update } = useWeekActions();
  const { bySlug } = useRecipeCardsFor(useMemo(() => (meals ?? []).flatMap((m) => m.recipeSlug ?? []), [meals]));
  const [adding, setAdding] = useState<{ day: number | null; label: string } | null>(null);
  const [shopping, setShopping] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | "none" | null>(null);

  const today = weekStart === thisWeek ? dayIndex(new Date()) : weekStart < thisWeek ? 7 : -1;
  const byDay = useMemo(() => {
    const groups = new Map<number | null, PlannedMeal[]>();
    for (const m of meals ?? []) groups.set(m.day, [...(groups.get(m.day) ?? []), m]);
    return groups;
  }, [meals]);

  // Dinners whose ingredients aren't on the shopping list yet.
  const toShop = (meals ?? []).filter((m) => m.recipeSlug && m.onListAt == null && m.cookedAt == null);

  // Desktop: drag a dinner onto another day.
  const dropProps = (day: number | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("text/meal-id")) return;
      e.preventDefault();
      setDropTarget(day ?? "none");
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: React.DragEvent) => {
      setDropTarget(null);
      const id = e.dataTransfer.getData("text/meal-id");
      const meal = meals?.find((m) => m.id === id);
      if (meal && meal.day !== day) update.mutate({ id, patch: { day } });
    },
  });

  const section = (day: number | null) => {
    const list = byDay.get(day) ?? [];
    const date = day == null ? null : fromIsoDate(addDays(weekStart, day));
    const label = day == null ? "Sometime this week" : DAY_NAMES[day]!;
    const past = day != null && day < today;
    const isToday = day === today;
    // Keep "sometime" out of the way when it's empty.
    if (day == null && list.length === 0 && !dropTarget) return null;
    return (
      <section
        key={day ?? "none"}
        {...dropProps(day)}
        className={cn(
          "rounded-2xl border bg-card/50 p-3 transition-colors",
          isToday && "border-primary/60 bg-primary/5",
          past && "opacity-60",
          dropTarget === (day ?? "none") && "border-primary bg-primary/10",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {label}
            {date && <span className="ml-2 font-normal text-muted-foreground">{dateLabel.format(date)}</span>}
            {isToday && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Today</span>}
          </h2>
          <button
            type="button"
            onClick={() => setAdding({ day, label: date ? `${label} ${dateLabel.format(date)}` : label })}
            aria-label={`Add dinner on ${label}`}
            className="grid size-8 place-items-center rounded-full text-primary active:bg-accent"
          >
            <Plus className="size-5" />
          </button>
        </div>
        <div className="space-y-2">
          {list.map((m) => (
            <MealCard key={m.id} meal={m} recipe={m.recipeSlug ? bySlug.get(m.recipeSlug) : undefined} />
          ))}
          {list.length === 0 && (
            <button
              type="button"
              onClick={() => setAdding({ day, label: date ? `${label} ${dateLabel.format(date)}` : label })}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground active:bg-accent"
            >
              Add dinner
            </button>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="md:mx-auto md:max-w-7xl md:pt-4">
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
          <Button className="flex-1 md:flex-none" onClick={() => setShopping(true)} disabled={toShop.length === 0}>
            <ShoppingCart />
            {toShop.length === 0
              ? (meals?.some((m) => m.onListAt != null) ? "Ingredients are on the list" : "Add ingredients to list")
              : `Add ingredients for ${toShop.length} dinner${toShop.length === 1 ? "" : "s"}`}
          </Button>
          <Button variant="outline" size="icon" aria-label="Add dinner sometime this week" onClick={() => setAdding({ day: null, label: "Sometime this week" })}>
            <Plus />
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-3 px-4 pt-1 pb-6 md:px-6">
        {isPending ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : (
          <>
            {section(null)}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{DAY_NAMES.map((_, day) => section(day))}</div>
          </>
        )}
      </div>

      {adding && (
        <AddMealDrawer open onOpenChange={(open) => !open && setAdding(null)} weekStart={weekStart} day={adding.day} label={adding.label} />
      )}
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

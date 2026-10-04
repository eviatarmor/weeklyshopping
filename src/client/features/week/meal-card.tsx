import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Clock, ListChecks, MoreHorizontal, Trash2, Users } from "lucide-react";
import { addDays } from "@/shared/week";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { CheckCircle, Chip, Segmented, Thumb } from "@/client/components/ui/misc";
import type { RecipeCard } from "@/client/features/recipes/use-recipes";
import { sizedImage } from "@/client/lib/images";
import { cn, haptic } from "@/client/lib/utils";
import { useWeekActions, type PlannedMeal } from "./use-week";

/** One planned dinner: tick it when cooked, tap ⋯ to move it to another week, resize or remove it. */
export function MealCard({ meal, recipe }: { meal: PlannedMeal; recipe: RecipeCard | undefined }) {
  const { setCooked } = useWeekActions();
  const [editing, setEditing] = useState(false);
  const title = recipe?.title ?? meal.customName ?? "Recipe no longer available";
  const cooked = meal.cookedAt != null;

  const body = (
    <>
      <Thumb src={sizedImage(recipe?.imageUrl, 96)} emoji={recipe ? "🍽️" : "🍳"} className="size-12 [&_img]:object-cover" alt="" />
      <span className="min-w-0 flex-1">
        <span className={cn("line-clamp-2 text-sm leading-snug font-medium", cooked && "text-muted-foreground line-through")}>{title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" /> {meal.servings}
          </span>
          {recipe?.prepMinutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {recipe.prepMinutes}m
            </span>
          )}
          {meal.onListAt != null && (
            <span className="flex items-center gap-1 text-primary">
              <ListChecks className="size-3" /> on list
            </span>
          )}
        </span>
      </span>
    </>
  );

  return (
    <div
      data-meal
      className={cn("flex items-center gap-2 rounded-xl border bg-card py-2 pr-1 pl-2 shadow-xs", cooked && "opacity-70")}
    >
      {recipe ? (
        <Link to="/recipes/$slug" params={{ slug: recipe.slug }} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <CheckCircle
        checked={cooked}
        aria-label={cooked ? "Mark as not cooked" : "Mark as cooked"}
        onClick={() => {
          haptic(cooked ? 5 : 12);
          setCooked.mutate({ id: meal.id, cooked: !cooked });
        }}
      />
      <button type="button" aria-label="More" onClick={() => setEditing(true)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      <MealOptionsDrawer meal={meal} title={title} recipeSlug={recipe?.slug} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

function MealOptionsDrawer({
  meal,
  title,
  recipeSlug,
  open,
  onOpenChange,
}: {
  meal: PlannedMeal;
  title: string;
  recipeSlug: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { update, remove } = useWeekActions();
  const move = (patch: { weekStart: string }) => {
    haptic();
    update.mutate({ id: meal.id, patch });
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="line-clamp-2">{title}</DrawerTitle>
          <DrawerDescription>{meal.servings} people</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-5 px-4 pb-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Move to</h3>
            <div className="flex flex-wrap gap-2">
              <Chip onClick={() => move({ weekStart: addDays(meal.weekStart, -7) })}>← Last week</Chip>
              <Chip onClick={() => move({ weekStart: addDays(meal.weekStart, 7) })}>Next week →</Chip>
            </div>
          </section>
          <section className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Servings</h3>
            <Segmented
              value={String(meal.servings)}
              onChange={(v) => update.mutate({ id: meal.id, patch: { servings: Number(v) } })}
              options={[1, 2, 3, 4, 6].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </section>
        </div>
        <DrawerFooter>
          {recipeSlug && (
            <Button asChild variant="outline" size="lg">
              <Link to="/recipes/$slug" params={{ slug: recipeSlug }}>
                <BookOpen /> Open recipe
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="lg"
            className="text-destructive"
            onClick={() => {
              remove.mutate({ id: meal.id });
              onOpenChange(false);
            }}
          >
            <Trash2 /> Remove from week
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

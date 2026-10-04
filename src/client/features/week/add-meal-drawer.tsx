import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Clock, PenLine, Search } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { Stars, Thumb } from "@/client/components/ui/misc";
import type { RecipeCard } from "@/client/features/recipes/use-recipes";
import { sizedImage } from "@/client/lib/images";
import { useTRPC } from "@/client/lib/trpc";
import { haptic } from "@/client/lib/utils";
import { useWeekActions } from "./use-week";

/** Pick a dinner for a day: search the recipes, choose a favourite, or just type a name. */
export function AddMealDrawer({
  open,
  onOpenChange,
  weekStart,
  day,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  day: number | null;
  label: string;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const { add } = useWeekActions();
  const q = useDeferredValue(query.trim());
  const listOptions = { staleTime: 60_000, enabled: open, placeholderData: keepPreviousData };
  const search = useQuery(trpc.recipes.list.queryOptions({ kind: "meal", query: q, limit: 40 }, { ...listOptions, enabled: open && q.length > 0 }));
  const favourites = useQuery(trpc.recipes.list.queryOptions({ kind: "meal", favourites: true, limit: 12 }, listOptions)).data?.items ?? [];
  const suggestions = useQuery(trpc.recipes.recommended.queryOptions(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false, enabled: open })).data?.items ?? [];
  const results = q ? (search.data?.items ?? []) : [];

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  const pick = (input: { recipeSlug?: string; customName?: string }) => {
    haptic();
    add.mutate({ weekStart, day, servings: 2, ...input });
    close();
  };

  return (
    <Drawer open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DrawerContent className="h-[92dvh] md:h-auto">
        <DrawerHeader>
          <DrawerTitle>Add dinner</DrawerTitle>
          <DrawerDescription>{label}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-3">
          <label className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) pick({ customName: query.trim() });
              }}
              placeholder="Search recipes or type any dinner"
              className="h-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          {q ? (
            <>
              <button type="button" onClick={() => pick({ customName: query.trim() })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-accent">
                <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <PenLine className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">Add "{query.trim()}"</span>
                  <span className="block text-xs text-muted-foreground">Your own dinner, no recipe</span>
                </span>
              </button>
              {results.map((r) => (
                <RecipeRow key={r.slug} recipe={r} onPick={() => pick({ recipeSlug: r.slug })} />
              ))}
              {results.length === 0 && <p className="px-4 pt-4 text-sm text-muted-foreground">No recipes match. Add it as your own dinner above.</p>}
            </>
          ) : (
            <>
              {favourites.length > 0 && <Section title="Favourites" recipes={favourites} onPick={(slug) => pick({ recipeSlug: slug })} />}
              {suggestions.length > 0 && <Section title="Recommended for you" recipes={suggestions} onPick={(slug) => pick({ recipeSlug: slug })} />}
              {favourites.length === 0 && suggestions.length === 0 && (
                <p className="px-4 pt-2 text-sm text-muted-foreground">Search for a recipe, or type the name of any dinner (like "Leftovers" or "Pizza night").</p>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Section({ title, recipes, onPick }: { title: string; recipes: RecipeCard[]; onPick: (slug: string) => void }) {
  return (
    <section className="pb-2">
      <h3 className="px-4 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {recipes.map((r) => (
        <RecipeRow key={r.slug} recipe={r} onPick={() => onPick(r.slug)} />
      ))}
    </section>
  );
}

function RecipeRow({ recipe: r, onPick }: { recipe: RecipeCard; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex w-full items-center gap-3 px-4 py-2 text-left active:bg-accent">
      <Thumb src={sizedImage(r.imageUrl, 96)} emoji="🍽️" className="size-12 [&_img]:object-cover" alt="" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-snug font-medium">{r.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {r.avgStars != null && <Stars value={r.avgStars} size="sm" />}
          {r.prepMinutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {r.prepMinutes}m
            </span>
          )}
          <span>{r.source.label}</span>
        </span>
      </span>
    </button>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, ChefHat, ChevronLeft, Clock, ExternalLink, Play, RotateCcw, Share2, ShoppingCart, Users, X } from "lucide-react";
import { toast } from "sonner";
import { batchesFor, blendTree, type BlendRecipe } from "@/shared/expand";
import { spoonStandardFor } from "@/shared/measure";
import { recipeSource } from "@/shared/sources";
import { roundQty } from "@/shared/units";
import { Button } from "@/client/components/ui/button";
import { Badge, Segmented, Skeleton, Stars, Thumb } from "@/client/components/ui/misc";
import { AddToListDrawer } from "@/client/features/recipes/add-to-list-drawer";
import { BlendTree } from "@/client/features/recipes/blend-tree";
import { Energy } from "@/client/features/recipes/energy";
import { MeasureToggle, Quantity } from "@/client/features/recipes/quantity";
import { useMeasureSystem } from "@/client/lib/preferences";
import { emojiFor, sizedImage } from "@/client/lib/images";
import { useCatalog } from "@/client/features/list/use-list";
import { useRecipeDetail } from "@/client/features/recipes/use-recipes";
import { AddToWeekDrawer } from "@/client/features/week/add-to-week-drawer";
import { setCookingPeople, startCooking, stopCooking, useCooking } from "@/client/features/cooking/cooking";
import { StepTimers } from "@/client/features/cooking/step-timers";
import { useNow, useTimers } from "@/client/features/cooking/use-timers";
import { stepTimers } from "@/shared/timers";
import { useTRPC } from "@/client/lib/trpc";
import { cn, haptic, timeAgo } from "@/client/lib/utils";

export const Route = createFileRoute("/recipes/$slug")({ component: RecipePage });

/** Send a link to this recipe through the phone's share sheet (WhatsApp, Messages…), or copy it. */
async function shareRecipe(title: string, slug: string) {
  const url = `${window.location.origin}/recipes/${slug}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // Closed the share sheet: nothing to do.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: "Paste it to send the recipe." });
  } catch {
    toast.error("Couldn't copy the link");
  }
}

function RecipePage() {
  const { slug } = Route.useParams();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const detail = useRecipeDetail(slug);
  const activity = useQuery(trpc.recipes.activity.queryOptions({ slug }, { refetchOnWindowFocus: false }));
  const { historyByName } = useCatalog();
  const usuallyHave = useMemo(() => [...historyByName.values()].filter((h) => h.usuallyHave).map((h) => h.normalizedName), [historyByName]);
  const data = detail.data
    ? { ...detail.data, ratings: activity.data?.ratings ?? [], cooked: activity.data?.cooked ?? [], usuallyHave }
    : undefined;
  const { isPending, error } = detail;
  const cooking = useCooking();
  const cookingThis = cooking?.slug === slug;
  const timers = useTimers().data ?? [];
  const now = useNow(cookingThis && timers.some((t) => t.firedAt == null));
  const [servingsOverride, setServingsState] = useState<number | null>(cookingThis ? cooking.people : null);
  const setServings = (n: number) => {
    setServingsState(n);
    if (cookingThis) setCookingPeople(n);
  };
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);
  // Ticked-off steps and ingredients, shared live with the rest of the household.
  const progressKey = trpc.recipes.progress.queryKey({ slug });
  const progress = useQuery(trpc.recipes.progress.queryOptions({ slug }, { staleTime: Infinity }));
  const doneSteps = new Set(progress.data?.steps ?? []);
  const doneIngredients = new Set(progress.data?.ingredients ?? []);
  const setProgress = useMutation(
    trpc.recipes.setProgress.mutationOptions({
      onMutate: ({ steps, ingredients }) => qc.setQueryData(progressKey, { steps, ingredients }),
      onError: (e) => {
        toast.error(e.message);
        void qc.invalidateQueries({ queryKey: progressKey });
      },
    }),
  );
  const toggleIn = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return [...next];
  };
  const toggleStep = (index: number) => {
    haptic(doneSteps.has(index) ? 5 : 12);
    setProgress.mutate({ slug, steps: toggleIn(doneSteps, index), ingredients: [...doneIngredients] });
  };
  const toggleIngredient = (path: string) => {
    setProgress.mutate({ slug, steps: [...doneSteps], ingredients: toggleIn(doneIngredients, path) });
  };
  const resetProgress = () => setProgress.mutate({ slug, steps: [], ingredients: [] });
  const [system, setSystem] = useMeasureSystem();

  const invalidate = () => {
    // Ratings change this page, the list stats and the recommendations.
    void qc.invalidateQueries(trpc.recipes.pathFilter());
  };
  const rate = useMutation(trpc.recipes.rate.mutationOptions({ onSuccess: invalidate, onError: (e) => toast.error(e.message) }));
  const cooked = useMutation(
    trpc.recipes.markCooked.mutationOptions({
      onSuccess: () => {
        invalidate();
        // Cooking it clears the ticks for next time.
        qc.setQueryData(progressKey, { steps: [], ingredients: [] });
        if (cookingThis) stopCooking();
        toast.success("Nice! Marked as cooked");
      },
    }),
  );

  const blends = useMemo(() => new Map<string, BlendRecipe>(Object.entries(data?.blends ?? {})), [data?.blends]);

  const back = () => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: "/recipes" }));

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="aspect-[4/3] rounded-none" />
        <Skeleton className="mx-4 h-8" />
        <Skeleton className="mx-4 h-40" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-muted-foreground">Recipe not found.</p>
        {error && <p className="mb-4 text-xs break-words text-muted-foreground/70">{error.message}</p>}
        <Button asChild variant="outline">
          <Link to="/recipes">Back to recipes</Link>
        </Button>
      </div>
    );
  }

  const { recipe, ingredients, ratings } = data;
  const isBlend = recipe.kind === "blend";
  const source = recipeSource(recipe.sourceUrl);
  const standard = spoonStandardFor(recipe.sourceUrl);
  // Meals scale by people. A blend batch makes one sachet, which serves 2 people in the meal-kit recipes.
  const people = servingsOverride ?? (isBlend ? 2 : recipe.servings);
  const factor = isBlend ? people / 2 : people / recipe.servings;
  const servings = recipe.servings * factor;
  const mine = ratings.find((r) => r.mine);
  const others = ratings.filter((r) => !r.mine);
  const avg = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null;

  const start = () => {
    startCooking({ slug, title: recipe.title, imageUrl: recipe.imageUrl, people });
    toast.success("Cooking mode: the screen stays on", { description: "Leave this page and it shrinks to a bar at the bottom." });
  };
  const actions = cookingThis ? (
    <div className="flex gap-2">
      <Button size="lg" variant="outline" onClick={stopCooking} aria-label="Stop cooking">
        <X /> Stop
      </Button>
      <Button size="lg" className="flex-1" disabled={cooked.isPending} onClick={() => (isBlend ? stopCooking() : cooked.mutate({ slug }))}>
        <ChefHat /> {isBlend ? "Done" : "Done, we cooked it"}
      </Button>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button size="lg" variant="outline" className="flex-1" onClick={() => setAdding(true)}>
        <ShoppingCart /> Add to list
      </Button>
      <Button size="lg" className="flex-1" onClick={start}>
        <Play /> {isBlend ? "Start making" : "Start cooking"}
      </Button>
    </div>
  );

  return (
    <div className="pb-28 md:mx-auto md:grid md:max-w-6xl md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-x-10 md:px-8 md:pt-8 md:pb-10">
      {/* Left column on desktop: photo, details, ingredients. */}
      <div className="md:min-w-0">
      <div className="relative">
        <Thumb src={sizedImage(recipe.imageUrl, 450)} emoji={!isBlend ? "🍽️" : recipe.tags.includes("sauce") ? "🥫" : "🧂"} className="aspect-[4/3] w-full rounded-none text-6xl md:rounded-2xl [&_img]:object-cover" alt={recipe.title} />
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 grid size-10 place-items-center rounded-full bg-background/85 shadow backdrop-blur"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          onClick={() => void shareRecipe(recipe.title, slug)}
          aria-label="Share"
          className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 grid size-10 place-items-center rounded-full bg-background/85 shadow backdrop-blur"
        >
          <Share2 className="size-5" />
        </button>
      </div>

      <div className="space-y-5 px-4 pt-4 md:px-0">
        <div>
          {isBlend && <Badge className="mb-2">{recipe.tags.includes("sauce") ? "Sauce" : "Seasoning blend"}</Badge>}
          <h1 className="text-2xl leading-tight font-bold">{recipe.title}</h1>
          {recipe.subtitle && <p className="mt-1 text-muted-foreground">{recipe.subtitle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {recipe.prepMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="size-4" /> {recipe.prepMinutes} min
              </span>
            )}
            <Energy kcal={recipe.kcal} />
            {avg != null && (
              <span className="flex items-center gap-1">
                <Stars value={avg} size="sm" /> {avg.toFixed(1)}
              </span>
            )}
            {data.cooked.length > 0 && (
              <span className="flex items-center gap-1">
                <ChefHat className="size-4" /> {data.cooked.length}× · last {timeAgo(data.cooked[0]!.cookedAt)}
              </span>
            )}
            {recipe.sourceUrl && (
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary">
                {source.label} <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        {recipe.description && <p className="text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>}

        {recipe.kcal != null && (recipe.proteinG != null || recipe.carbsG != null || recipe.fatG != null) && (
          <section className="grid grid-cols-4 gap-2 rounded-xl border bg-card p-3 text-center">
            {[
              { label: "Energy", value: <Energy kcal={recipe.kcal} className="[&_svg]:hidden" /> },
              { label: "Protein", value: recipe.proteinG != null ? `${Math.round(recipe.proteinG)} g` : "–" },
              { label: "Carbs", value: recipe.carbsG != null ? `${Math.round(recipe.carbsG)} g` : "–" },
              { label: "Fat", value: recipe.fatG != null ? `${Math.round(recipe.fatG)} g` : "–" },
            ].map((n) => (
              <div key={n.label}>
                <div className="text-sm font-semibold">{n.value}</div>
                <div className="text-[11px] text-muted-foreground">{n.label}</div>
              </div>
            ))}
            <p className="col-span-4 text-[11px] text-muted-foreground">Per serving · estimate from {source.label}</p>
          </section>
        )}

        {!isBlend && (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Your rating</h2>
              <Stars value={mine?.stars ?? null} size="lg" onChange={(stars) => rate.mutate({ slug, stars })} />
            </div>
            {others.map((r) => (
              <div key={r.userEmail} className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>{r.name}</span>
                <Stars value={r.stars} size="sm" />
              </div>
            ))}
          </section>
        )}

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <MeasureToggle value={system} onChange={setSystem} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              <Segmented
                value={String(people)}
                onChange={(v) => setServings(Number(v))}
                options={[2, 4].map((n) => ({ value: String(n), label: String(n) }))}
              />
              {isBlend && (
                // One sachet for 2 people, two for 4.
                <span className="text-xs">
                  = {factor} {recipe.yieldUnit ?? "batch"}
                  {factor === 1 ? "" : (recipe.yieldUnit ?? "batch").endsWith("h") ? "es" : "s"}
                </span>
              )}
            </div>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {ingredients.map((i, index) => {
              const blend = i.blendSlug ? blends.get(i.blendSlug) : undefined;
              const tree = blend ? blendTree(blend.slug, blends, batchesFor(i, blend) * factor) : null;
              const image = i.imageUrl ?? (i.productSlug ? data.productImages[i.productSlug] : null);
              const qty = i.qty == null ? null : roundQty(i.qty * factor, i.unit);
              const ticked = doneIngredients.has(String(index));
              return (
                <li key={index} className="px-3 py-2.5">
                  {/* Tap an ingredient once it's in the pan. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={ticked}
                    aria-label={`${i.name} added`}
                    onClick={() => {
                      haptic(ticked ? 5 : 12);
                      toggleIngredient(String(index));
                    }}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="relative">
                      <Thumb src={sizedImage(image, 36)} emoji={emojiFor(i.name)} className={cn("size-9", ticked && "opacity-40")} />
                      {ticked && (
                        <span className="absolute inset-0 grid place-items-center">
                          <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" strokeWidth={3} />
                          </span>
                        </span>
                      )}
                    </span>
                    <span className={cn("flex-1", ticked && "text-muted-foreground line-through")}>
                      <span className="font-medium">{i.name}</span>
                      {i.pantry && <span className="ml-2 text-xs text-muted-foreground no-underline">pantry</span>}
                    </span>
                    <span className={cn(ticked && "opacity-50")}>
                      <Quantity qty={qty} unit={i.unit} name={i.name} system={system} standard={standard} />
                    </span>
                  </button>
                  {tree && (
                    <div className="mt-2 ml-12 rounded-lg bg-muted/60 p-2.5">
                      <BlendTree
                        node={tree}
                        path={String(index)}
                        done={doneIngredients}
                        onToggle={toggleIngredient}
                        renderQty={(leaf) => <Quantity qty={leaf.qty} unit={leaf.unit} name={leaf.name} system={system} standard={standard} />}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

      </div>
      </div>

      {/* Right column on desktop: method, used in, cooked. Below the ingredients on phones. */}
      <div className="space-y-5 px-4 pt-5 md:px-0 md:pt-0">
        <div className="hidden md:block">{actions}</div>
        {recipe.steps.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Method</h2>
              {(doneSteps.size > 0 || doneIngredients.size > 0) && (
                <button
                  type="button"
                  onClick={resetProgress}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                >
                  {doneSteps.size}/{recipe.steps.length} done · <RotateCcw className="size-3" /> Reset
                </button>
              )}
            </div>
            <ol className="space-y-4">
              {recipe.steps.map((step, index) => {
                const done = doneSteps.has(index);
                return (
                <li key={index} className="flex gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`Step ${index + 1} done`}
                    onClick={() => toggleStep(index)}
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors active:scale-90",
                      done ? "border-primary bg-card text-primary opacity-50" : "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className={cn("space-y-2 transition-opacity", done && "opacity-50")} onClick={() => toggleStep(index)}>
                      {step.imageUrl && (
                        <img src={sizedImage(step.imageUrl, 400) ?? undefined} alt="" loading="lazy" className="w-full rounded-lg" />
                      )}
                      <p className={cn("text-sm leading-relaxed whitespace-pre-line", done && "line-through decoration-muted-foreground/50")}>{step.text}</p>
                    </div>
                    {/* Timers show once you start cooking. */}
                    {cookingThis && <StepTimers slug={slug} suggestions={stepTimers(step.text, index)} timers={timers} now={now} />}
                  </div>
                </li>
                );
              })}
            </ol>
          </section>
        )}

        {data.usedIn.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Used in</h2>
            <ul className="space-y-1">
              {data.usedIn.map((r) => (
                <li key={r.slug}>
                  <Link to="/recipes/$slug" params={{ slug: r.slug }} className="text-sm font-medium text-primary">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isBlend && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setPlanning(true)}>
              <CalendarPlus /> Add to week
            </Button>
            <Button variant="outline" onClick={() => cooked.mutate({ slug })} disabled={cooked.isPending}>
              <ChefHat /> We cooked this
            </Button>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t bg-background/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-lg md:hidden">
        {actions}
      </div>

      {!isBlend && <AddToWeekDrawer slug={slug} title={recipe.title} servings={people} open={planning} onOpenChange={setPlanning} />}
      <AddToListDrawer data={data} servings={servings} people={isBlend ? people : undefined} open={adding} onOpenChange={setAdding} system={system} standard={standard} />
    </div>
  );
}

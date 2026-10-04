import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, ChevronLeft, Clock, ExternalLink, Users } from "lucide-react";
import { toast } from "sonner";
import { blendTree, type BlendRecipe } from "@/shared/expand";
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
import { useRecipeDetail } from "@/client/lib/static-data";
import { useTRPC } from "@/client/lib/trpc";
import { timeAgo } from "@/client/lib/utils";

export const Route = createFileRoute("/recipes/$slug")({ component: RecipePage });

function RecipePage() {
  const { slug } = Route.useParams();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  // Recipe content is a static file; only ratings and cooked history come from the API.
  const detail = useRecipeDetail(slug);
  const activity = useQuery(trpc.recipes.activity.queryOptions({ slug }, { refetchOnWindowFocus: false }));
  const { historyByName } = useCatalog();
  const usuallyHave = useMemo(() => [...historyByName.values()].filter((h) => h.usuallyHave).map((h) => h.normalizedName), [historyByName]);
  const data = detail.data
    ? { ...detail.data, ratings: activity.data?.ratings ?? [], cooked: activity.data?.cooked ?? [], usuallyHave }
    : undefined;
  const { isPending, error } = detail;
  const [servingsOverride, setServings] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
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
  const servings = servingsOverride ?? recipe.servings;
  const factor = servings / recipe.servings;
  const mine = ratings.find((r) => r.mine);
  const others = ratings.filter((r) => !r.mine);
  const avg = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null;

  return (
    <div className="pb-28">
      <div className="relative">
        <Thumb src={sizedImage(recipe.imageUrl, 450)} emoji={isBlend ? "🧂" : "🍽️"} className="aspect-[4/3] w-full rounded-none text-6xl [&_img]:object-cover" alt={recipe.title} />
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 grid size-10 place-items-center rounded-full bg-background/85 shadow backdrop-blur"
        >
          <ChevronLeft className="size-6" />
        </button>
      </div>

      <div className="space-y-5 px-4 pt-4">
        <div>
          {isBlend && <Badge className="mb-2">Seasoning blend</Badge>}
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
            {!isBlend && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="size-4" />
                <Segmented
                  value={String(servings)}
                  onChange={(v) => setServings(Number(v))}
                  options={[2, 4].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </div>
            )}
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {ingredients.map((i, index) => {
              const tree = i.blendSlug ? blendTree(i.blendSlug, blends) : null;
              const image = i.imageUrl ?? (i.productSlug ? data.productImages[i.productSlug] : null);
              const qty = i.qty == null ? null : roundQty(i.qty * factor, i.unit);
              return (
                <li key={index} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Thumb src={sizedImage(image, 36)} emoji={emojiFor(i.name)} className="size-9" />
                    <span className="flex-1">
                      <span className="font-medium">{i.name}</span>
                      {i.pantry && <span className="ml-2 text-xs text-muted-foreground">pantry</span>}
                    </span>
                    <Quantity qty={qty} unit={i.unit} name={i.name} system={system} standard={standard} />
                  </div>
                  {tree && (
                    <div className="mt-2 ml-12 rounded-lg bg-muted/60 p-2.5">
                      <BlendTree node={tree} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {recipe.steps.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Method</h2>
            <ol className="space-y-4">
              {recipe.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    {step.imageUrl && (
                      <img src={sizedImage(step.imageUrl, 400) ?? undefined} alt="" loading="lazy" className="w-full rounded-lg" />
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-line">{step.text}</p>
                  </div>
                </li>
              ))}
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
          <Button variant="outline" className="w-full" onClick={() => cooked.mutate({ slug })} disabled={cooked.isPending}>
            <ChefHat /> We cooked this
          </Button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t bg-background/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-lg">
        <Button size="lg" className="w-full" onClick={() => setAdding(true)}>
          Add ingredients to list
        </Button>
      </div>

      <AddToListDrawer data={data} servings={servings} open={adding} onOpenChange={setAdding} system={system} standard={standard} />
    </div>
  );
}

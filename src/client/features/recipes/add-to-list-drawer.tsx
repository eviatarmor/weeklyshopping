import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { expandRecipes, type BlendChoice, type BlendRecipe, type IngredientRow, type ShoppingLine } from "@/shared/expand";
import { makeKitchenMatcher } from "@/shared/kitchen";
import { normalizeName } from "@/shared/normalize";
import { useKitchen } from "./kitchen";
import type { MeasureSystem, SpoonStandard } from "@/shared/measure";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { CheckIndicator, Segmented, Thumb } from "@/client/components/ui/misc";
import { Quantity } from "@/client/features/recipes/quantity";
import { emojiFor, sizedImage } from "@/client/lib/images";
import type { RecipeDetail } from "@/shared/recipe-types";
import { useTRPC } from "@/client/lib/trpc";
import { cn, haptic } from "@/client/lib/utils";

type RecipeData = RecipeDetail & { usuallyHave: string[] };

/** A line as sent to the server: `have` lines are remembered as "usually have", the rest are added. */
export type ListLine = { name: string; qty: number | null; unit: string | null; productSlug: string | null; imageUrl: string | null; have: boolean };

/** Ingredients of one recipe, from its page. */
export function AddToListDrawer({
  data,
  servings,
  people,
  open,
  onOpenChange,
  system,
  standard,
}: {
  data: RecipeData;
  servings: number;
  /** Blends: how many people the batch is for (servings are sachets). */
  people?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  system: MeasureSystem;
  standard: SpoonStandard;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.recipes.addToList.mutationOptions());
  return (
    <ShoppingDrawer
      recipes={[{ detail: data, servings }]}
      usuallyHave={data.usuallyHave}
      open={open}
      onOpenChange={onOpenChange}
      system={system}
      standard={standard}
      description={`Untick what's already in your kitchen. ${data.recipe.title} for ${people ?? servings} people.`}
      pending={mutation.isPending}
      submit={(lines) => mutation.mutateAsync({ slug: data.recipe.slug, lines })}
    />
  );
}

/**
 * "Already have any of these?": the combined shopping lines of one or more recipes,
 * with buy-or-make toggles for blends and a tick per line.
 */
export function ShoppingDrawer({
  recipes,
  usuallyHave: usuallyHaveList,
  open,
  onOpenChange,
  system,
  standard,
  description,
  pending,
  submit,
}: {
  recipes: { detail: RecipeDetail; servings: number }[];
  usuallyHave: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  system: MeasureSystem;
  standard: SpoonStandard;
  description: string;
  pending: boolean;
  submit: (lines: ListLine[]) => Promise<{ added: number; skipped: number }>;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [choices, setChoices] = useState<Record<string, BlendChoice>>({});
  /** line.key → true when the user wants to buy it. Missing keys use the default. */
  const [buy, setBuy] = useState<Record<string, boolean>>({});

  const blends = useMemo(
    () => new Map<string, BlendRecipe>(recipes.flatMap((r) => Object.entries(r.detail.blends))),
    [recipes],
  );
  const productImages = useMemo(() => Object.assign({}, ...recipes.map((r) => r.detail.productImages)) as Record<string, string | null>, [recipes]);
  const usuallyHave = useMemo(() => new Set(usuallyHaveList), [usuallyHaveList]);
  // Things already in the kitchen start unticked too.
  const { data: kitchen } = useKitchen();
  const inKitchen = useMemo(() => makeKitchenMatcher((kitchen ?? []).map((k) => k.name)), [kitchen]);
  const lines = useMemo(
    () => expandRecipes(recipes.map((r) => ({ ingredients: r.detail.ingredients, factor: r.servings / r.detail.recipe.servings })), blends, choices),
    [recipes, blends, choices],
  );

  const defaultBuy = (line: ShoppingLine) => !(line.pantry || line.optional || usuallyHave.has(normalizeName(line.name)) || inKitchen(line.name));
  const wants = (line: ShoppingLine) => buy[line.key] ?? defaultBuy(line);
  const count = lines.filter(wants).length;

  // Blends that appear in these recipes (top level or nested), for the buy/make toggles.
  const blendSlugs = useMemo(() => {
    const found = new Set<string>();
    const walk = (rows: IngredientRow[]) => {
      for (const r of rows) {
        if (!r.blendSlug || found.has(r.blendSlug)) continue;
        found.add(r.blendSlug);
        if (choices[r.blendSlug] === "scratch") walk(blends.get(r.blendSlug)?.ingredients ?? []);
      }
    };
    for (const r of recipes) walk(r.detail.ingredients);
    return [...found];
  }, [recipes, blends, choices]);

  const confirm = async () => {
    try {
      const { added, skipped } = await submit(
        lines.map((l) => ({
          name: l.name,
          qty: l.qty,
          unit: l.unit,
          productSlug: l.productSlug,
          imageUrl: l.imageUrl ?? (l.productSlug ? (productImages[l.productSlug] ?? null) : null),
          have: !wants(l),
        })),
      );
      void qc.invalidateQueries({ queryKey: trpc.list.get.queryKey() });
      // "Usually have" answers live in the household history.
      void qc.invalidateQueries({ queryKey: trpc.catalog.get.queryKey() });
      onOpenChange(false);
      toast.success(`Added ${added} item${added === 1 ? "" : "s"}`, {
        description: skipped ? `Skipped ${skipped} you already have` : undefined,
        action: { label: "View list", onClick: () => void navigate({ to: "/" }) },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Already have any of these?</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto">
          {blendSlugs.length > 0 && (
            <div className="mx-4 mb-3 space-y-2 rounded-xl bg-muted/60 p-3">
              {blendSlugs.map((slug) => (
                <div key={slug} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{blends.get(slug)?.title}</span>
                  <Segmented
                    value={choices[slug] ?? "buy"}
                    onChange={(v) => setChoices((c) => ({ ...c, [slug]: v }))}
                    options={[
                      { value: "buy", label: "Buy" },
                      { value: "scratch", label: "Make it" },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}

          <ul className="pb-2">
            {lines.map((line) => {
              const selected = wants(line);
              const image = line.imageUrl ?? (line.productSlug ? productImages[line.productSlug] : null);
              return (
                <li key={line.key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => {
                      haptic();
                      setBuy((b) => ({ ...b, [line.key]: !selected }));
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left"
                  >
                    <CheckIndicator checked={selected} />
                    <Thumb src={sizedImage(image, 36)} emoji={emojiFor(line.name)} className="size-9" />
                    <span className={cn("min-w-0 flex-1", !selected && "text-muted-foreground")}>
                      <span className="block truncate font-medium">{line.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          line.via.length ? `for ${line.via.join(" → ")}` : null,
                          !selected && inKitchen(line.name) ? "in the kitchen" : null,
                          !selected && !inKitchen(line.name) && (line.pantry || usuallyHave.has(normalizeName(line.name))) ? "usually have" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Quantity qty={line.qty} unit={line.unit} name={line.name} system={system} standard={standard} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <DrawerFooter>
          <Button size="lg" onClick={() => void confirm()} disabled={pending || count === 0}>
            {count === 0 ? "You have everything" : `Add ${count} item${count === 1 ? "" : "s"} to list`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { expandIngredients, type BlendChoice, type BlendRecipe, type ShoppingLine } from "@/shared/expand";
import { normalizeName } from "@/shared/normalize";
import type { MeasureSystem, SpoonStandard } from "@/shared/measure";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { CheckIndicator, Segmented, Thumb } from "@/client/components/ui/misc";
import { Quantity } from "@/client/features/recipes/quantity";
import { emojiFor, sizedImage } from "@/client/lib/images";
import type { RecipeDetail } from "@/shared/static-data";
import { useTRPC } from "@/client/lib/trpc";
import { cn, haptic } from "@/client/lib/utils";

type RecipeData = RecipeDetail & { usuallyHave: string[] };

export function AddToListDrawer({
  data,
  servings,
  open,
  onOpenChange,
  system,
  standard,
}: {
  data: RecipeData;
  servings: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  system: MeasureSystem;
  standard: SpoonStandard;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [choices, setChoices] = useState<Record<string, BlendChoice>>({});
  /** line.key → true when the user wants to buy it. Missing keys use the default. */
  const [buy, setBuy] = useState<Record<string, boolean>>({});

  const blends = useMemo(() => new Map<string, BlendRecipe>(Object.entries(data.blends)), [data.blends]);
  const usuallyHave = useMemo(() => new Set(data.usuallyHave), [data.usuallyHave]);
  const lines = useMemo(
    () => expandIngredients(data.ingredients, blends, choices, servings / data.recipe.servings),
    [data.ingredients, blends, choices, servings, data.recipe.servings],
  );

  const defaultBuy = (line: ShoppingLine) => !(line.pantry || line.optional || usuallyHave.has(normalizeName(line.name)));
  const wants = (line: ShoppingLine) => buy[line.key] ?? defaultBuy(line);
  const count = lines.filter(wants).length;

  // Blends that appear in this recipe (top level or nested), for the buy/make toggles.
  const blendSlugs = useMemo(() => {
    const found = new Set<string>();
    const walk = (rows: typeof data.ingredients) => {
      for (const r of rows) {
        if (!r.blendSlug || found.has(r.blendSlug)) continue;
        found.add(r.blendSlug);
        if (choices[r.blendSlug] === "scratch") walk(blends.get(r.blendSlug)?.ingredients ?? []);
      }
    };
    walk(data.ingredients);
    return [...found];
  }, [data.ingredients, blends, choices]);

  const mutation = useMutation(
    trpc.recipes.addToList.mutationOptions({
      onSuccess: ({ added, skipped }) => {
        void qc.invalidateQueries({ queryKey: trpc.list.get.queryKey() });
        // "Usually have" answers live in the household history.
        void qc.invalidateQueries({ queryKey: trpc.catalog.get.queryKey() });
        onOpenChange(false);
        toast.success(`Added ${added} item${added === 1 ? "" : "s"}`, {
          description: skipped ? `Skipped ${skipped} you already have` : undefined,
          action: { label: "View list", onClick: () => void navigate({ to: "/" }) },
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const confirm = () =>
    mutation.mutate({
      slug: data.recipe.slug,
      lines: lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unit: l.unit,
        productSlug: l.productSlug,
        imageUrl: l.imageUrl ?? (l.productSlug ? (data.productImages[l.productSlug] ?? null) : null),
        have: !wants(l),
      })),
    });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Already have any of these?</DrawerTitle>
          <DrawerDescription>
            Untick what's already in your kitchen. {servings} servings of {data.recipe.title}.
          </DrawerDescription>
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
              const image = line.imageUrl ?? (line.productSlug ? data.productImages[line.productSlug] : null);
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
                          !selected && (line.pantry || usuallyHave.has(normalizeName(line.name))) ? "usually have" : null,
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
          <Button size="lg" onClick={confirm} disabled={mutation.isPending || count === 0}>
            {count === 0 ? "You have everything" : `Add ${count} item${count === 1 ? "" : "s"} to list`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

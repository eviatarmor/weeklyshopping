import { useState } from "react";
import { Leaf, RotateCcw } from "lucide-react";
import type { Substitution } from "@/shared/recipe-types";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { cn } from "@/client/lib/utils";

/** Swaps chosen on this phone for a recipe, by ingredient position. */
export function useRecipeSwaps(slug: string) {
  const key = `swaps:${slug}`;
  const [swaps, setSwaps] = useState<Record<number, Substitution>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  });
  const update = (index: number, swap: Substitution | null) => {
    setSwaps((current) => {
      const next = { ...current };
      if (swap) next[index] = swap;
      else delete next[index];
      if (Object.keys(next).length) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
      return next;
    });
  };
  return [swaps, update] as const;
}

/** "Don't have it?": swaps for one ingredient, opened from the ⋯ on its row. */
export function SubstitutionDrawer({
  ingredient,
  options,
  current,
  onChoose,
  onClose,
}: {
  ingredient: string | null;
  options: Substitution[];
  current: Substitution | null;
  onChoose: (swap: Substitution | null) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={ingredient != null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Instead of {ingredient}</DrawerTitle>
          <DrawerDescription>Pick a swap and the recipe and shopping list use it instead (on this phone).</DrawerDescription>
        </DrawerHeader>
        <ul className="space-y-2 overflow-y-auto px-4 pb-3">
          {options.map((o) => {
            const chosen = current?.name === o.name;
            return (
              <li key={o.name}>
                <button
                  type="button"
                  onClick={() => {
                    onChoose(chosen ? null : o);
                    onClose();
                  }}
                  className={cn("w-full rounded-xl border bg-card px-3 py-2.5 text-left active:scale-[0.99]", chosen && "border-primary bg-primary/5")}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex-1 font-semibold">{o.name}</span>
                    {o.vegan && (
                      <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <Leaf className="size-3" /> vegan
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm">{o.amount}</span>
                  {o.note && <span className="mt-0.5 block text-xs text-muted-foreground">{o.note}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {current && (
          <DrawerFooter>
            <Button
              variant="outline"
              onClick={() => {
                onChoose(null);
                onClose();
              }}
            >
              <RotateCcw /> Use {ingredient} after all
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

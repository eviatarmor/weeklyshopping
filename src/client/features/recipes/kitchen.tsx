import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { useListItems } from "@/client/features/list/use-list";
import { useTRPC } from "@/client/lib/trpc";

export function useKitchen() {
  const trpc = useTRPC();
  return useQuery(trpc.household.kitchen.queryOptions(undefined, { staleTime: Infinity }));
}

export function useKitchenActions() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: trpc.household.kitchen.queryKey() });
    // "What can I make?" depends on the kitchen.
    void qc.invalidateQueries({ queryKey: trpc.recipes.list.pathKey() });
  };
  const add = useMutation(trpc.household.addToKitchen.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(e.message) }));
  const remove = useMutation(trpc.household.removeFromKitchen.mutationOptions({ onSuccess: refresh, onError: (e) => toast.error(e.message) }));
  return { add: (names: string[]) => add.mutate({ names }), remove: (names: string[]) => remove.mutate({ names }) };
}

/** What's in the fridge and pantry right now. Items bought from the list are added when the trolley is cleared. */
export function KitchenDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: kitchen } = useKitchen();
  const { add, remove } = useKitchenActions();
  const { data: list } = useListItems();
  const [text, setText] = useState("");
  const bought = (list ?? []).filter((i) => i.checked).map((i) => i.name);

  const submit = () => {
    const names = text
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length) add(names);
    setText("");
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>In our kitchen</DrawerTitle>
          <DrawerDescription>What you have now. Recipes are ranked by how little else you'd need. Salt, oil and other pantry staples are assumed.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 overflow-y-auto px-4 pb-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. eggs, feta, zucchini"
              aria-label="Add to kitchen"
              className="h-10 flex-1 rounded-xl border bg-card px-3 outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button type="submit" size="icon" aria-label="Add">
              <Plus />
            </Button>
          </form>
          {bought.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => add(bought)}>
              Add the {bought.length} item{bought.length === 1 ? "" : "s"} in the trolley
            </Button>
          )}
          <ul className="flex flex-wrap gap-1.5">
            {(kitchen ?? []).map((k) => (
              <li key={k.normalizedName} className="flex items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-sm">
                {k.name}
                <button type="button" aria-label={`Remove ${k.name}`} onClick={() => remove([k.name])} className="grid size-6 place-items-center rounded-full text-muted-foreground active:bg-accent">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {kitchen?.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet. Add what's in your fridge and pantry.</p>}
          {(kitchen?.length ?? 0) > 0 && (
            <button type="button" onClick={() => remove((kitchen ?? []).map((k) => k.name))} className="text-xs text-muted-foreground underline">
              Clear everything
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

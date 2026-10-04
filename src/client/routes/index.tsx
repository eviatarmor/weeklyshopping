import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ShoppingBasket } from "lucide-react";
import { normalizeName } from "@/shared/normalize";
import type { ListItem } from "@/shared/types";
import { PageHeader } from "@/client/components/page-header";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/misc";
import { AddItemBar } from "@/client/features/list/add-item-bar";
import { EditItemDrawer } from "@/client/features/list/edit-item-drawer";
import { ItemRow } from "@/client/features/list/item-row";
import { useCatalog, useListActions, useListItems } from "@/client/features/list/use-list";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";

export const Route = createFileRoute("/")({ component: ListPage });

function ListPage() {
  const trpc = useTRPC();
  const { data: items, isPending } = useListItems();
  const catalog = useCatalog();
  const recipes = useQuery(trpc.recipes.list.queryOptions());
  const actions = useListActions();
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [showChecked, setShowChecked] = useState(true);

  const recipeTitles = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.slug, r.title])), [recipes.data]);
  const unchecked = useMemo(() => (items ?? []).filter((i) => !i.checked), [items]);
  const checked = useMemo(() => (items ?? []).filter((i) => i.checked).sort((a, b) => b.updatedAt - a.updatedAt), [items]);
  const onList = useMemo(() => new Set(unchecked.map((i) => normalizeName(i.name))), [unchecked]);

  const groups = useMemo(() => {
    const order = catalog.sections.length ? catalog.sections : [];
    const bySection = new Map<string, ListItem[]>();
    for (const item of unchecked) bySection.set(item.sectionId, [...(bySection.get(item.sectionId) ?? []), item]);
    const known = order.filter((s) => bySection.has(s.id)).map((s) => ({ section: s, items: bySection.get(s.id)! }));
    const unknown = [...bySection.entries()]
      .filter(([id]) => !order.some((s) => s.id === id))
      .map(([id, list]) => ({ section: { id, name: "Other", emoji: "🛒", sortOrder: 999 }, items: list }));
    return [...known, ...unknown];
  }, [unchecked, catalog.sections]);

  const imageFor = (item: ListItem) => (item.productSlug ? (catalog.productBySlug.get(item.productSlug)?.imageUrl ?? null) : null);
  const row = (item: ListItem) => (
    <ItemRow
      key={item.id}
      item={item}
      imageUrl={imageFor(item)}
      recipeTitle={item.sourceRecipeSlug ? recipeTitles.get(item.sourceRecipeSlug) : undefined}
      onToggle={() => actions.toggle(item)}
      onOpen={() => setEditing(item)}
    />
  );

  return (
    <>
      <PageHeader
        title="Shopping"
        action={
          unchecked.length > 0 && (
            <span className="text-sm font-medium text-muted-foreground">
              {unchecked.length} item{unchecked.length === 1 ? "" : "s"}
            </span>
          )
        }
      >
        <AddItemBar onList={onList} />
      </PageHeader>

      {isPending ? (
        <div className="space-y-3 px-4 pt-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-8 pt-20 text-center text-muted-foreground">
          <ShoppingBasket className="size-14 stroke-1" />
          <p className="font-medium text-foreground">Your list is empty</p>
          <p className="text-sm">Add items above, or open a recipe and add its ingredients.</p>
        </div>
      ) : (
        <div className="pb-6">
          {groups.map(({ section, items: sectionItems }) => (
            <section key={section.id} className="pt-2">
              <h2 className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span className="text-base">{section.emoji}</span>
                {section.name}
                <span className="font-normal">· {sectionItems.length}</span>
              </h2>
              <ul>{sectionItems.map(row)}</ul>
            </section>
          ))}

          {checked.length > 0 && (
            <section className="mt-4 border-t pt-2">
              <div className="flex items-center justify-between px-4 py-1">
                <button
                  type="button"
                  onClick={() => setShowChecked((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  <ChevronDown className={cn("size-4 transition-transform", !showChecked && "-rotate-90")} />
                  In the trolley · {checked.length}
                </button>
                <Button variant="ghost" size="sm" onClick={actions.clearChecked}>
                  Clear
                </Button>
              </div>
              {showChecked && <ul>{checked.map(row)}</ul>}
            </section>
          )}
        </div>
      )}

      <EditItemDrawer item={editing} onClose={() => setEditing(null)} />
    </>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Check, ChevronDown, X } from "lucide-react";
import { STORE_LABELS, type PriceComparison, type Store } from "@/shared/grocery";
import type { ListItem } from "@/shared/types";
import { formatQty } from "@/shared/units";
import { Segmented, Thumb } from "@/client/components/ui/misc";
import { useWakeLock } from "@/client/features/cooking/cooking";
import { StoreBadge } from "@/client/features/list/prices";
import { useCatalog, useListActions, useListItems } from "@/client/features/list/use-list";
import { emojiFor, sizedImage } from "@/client/lib/images";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";

export const Route = createFileRoute("/shop")({ component: ShopPage });

type Group = { key: string; title: string; store?: Store; items: ListItem[] };
const money = (n: number) => `$${n.toFixed(2)}`;

/** In the supermarket: big rows, the screen stays on, tap anywhere on a row to tick it. */
function ShopPage() {
  useWakeLock(true);
  const trpc = useTRPC();
  const { data: items } = useListItems();
  const catalog = useCatalog();
  const actions = useListActions();
  const [groupBy, setGroupBy] = useState<"store" | "aisle">("store");
  const [showTrolley, setShowTrolley] = useState(false);

  const unchecked = useMemo(() => (items ?? []).filter((i) => !i.checked), [items]);
  const checked = useMemo(() => (items ?? []).filter((i) => i.checked).sort((a, b) => b.updatedAt - a.updatedAt), [items]);
  const prices = useQueries({
    queries: unchecked.map((i) =>
      trpc.prices.compare.queryOptions({ name: i.name }, { staleTime: 6 * 60 * 60_000, retry: 1, refetchOnWindowFocus: false, enabled: i.name.trim().length >= 2 }),
    ),
  });
  const priceOf = new Map(unchecked.map((item, index) => [item.id, prices[index]?.data as PriceComparison | undefined]));

  const groups: Group[] = useMemo(() => {
    if (groupBy === "aisle") {
      const bySection = new Map<string, ListItem[]>();
      for (const item of unchecked) bySection.set(item.sectionId, [...(bySection.get(item.sectionId) ?? []), item]);
      return [...catalog.sections, { id: "other", name: "Other", emoji: "🛒", sortOrder: 999 }]
        .filter((s) => bySection.has(s.id))
        .map((s) => ({ key: s.id, title: `${s.emoji} ${s.name}`, items: bySection.get(s.id)! }));
    }
    // By store: each item goes where it's the best buy.
    const byStore: Record<string, ListItem[]> = { woolworths: [], coles: [], anywhere: [] };
    for (const item of unchecked) byStore[priceOf.get(item.id)?.cheapest?.store ?? "anywhere"]!.push(item);
    return [
      { key: "woolworths", title: STORE_LABELS.woolworths, store: "woolworths" as const, items: byStore.woolworths! },
      { key: "coles", title: STORE_LABELS.coles, store: "coles" as const, items: byStore.coles! },
      { key: "anywhere", title: "Either store", items: byStore.anywhere! },
    ].filter((g) => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, unchecked, catalog.sections, prices.map((p) => p.dataUpdatedAt).join()]);

  const groupTotal = (g: Group) =>
    g.store ? g.items.reduce((sum, i) => sum + (priceOf.get(i.id)?.offers.find((o) => o.store === g.store)?.price ?? 0), 0) : 0;

  const row = (item: ListItem, store?: Store) => {
    const offer = store ? priceOf.get(item.id)?.offers.find((o) => o.store === store) : priceOf.get(item.id)?.cheapest;
    const qty = formatQty(item.qty, item.unit);
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => actions.toggle(item)}
          className={cn("flex w-full items-center gap-4 px-4 py-3.5 text-left active:bg-accent", item.checked && "opacity-50")}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full border-2",
              item.checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
            )}
          >
            {item.checked && <Check className="size-5" strokeWidth={3} />}
          </span>
          <Thumb src={sizedImage(item.imageUrl ?? catalog.productBySlug.get(item.productSlug ?? "")?.imageUrl, 48)} emoji={emojiFor(item.name, item.sectionId)} className="size-12 text-xl" />
          <span className="min-w-0 flex-1">
            <span className={cn("block text-lg leading-tight font-semibold", item.checked && "line-through")}>{item.name}</span>
            {(qty || item.note) && <span className="block text-sm text-muted-foreground">{[qty, item.note].filter(Boolean).join(" · ")}</span>}
          </span>
          {offer && !item.checked && <span className="shrink-0 text-base font-semibold tabular-nums">{money(offer.price)}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className="mx-auto min-h-full max-w-2xl pb-10">
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur-lg">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div>
            <h1 className="text-xl font-bold">Shopping</h1>
            <p className="text-xs text-muted-foreground">
              {unchecked.length} to get · screen stays on
            </p>
          </div>
          <Link to="/" aria-label="Done shopping" className="flex h-10 items-center gap-1 rounded-full bg-primary px-4 font-semibold text-primary-foreground">
            <X className="size-4" /> Done
          </Link>
        </div>
        <div className="px-4 pb-2">
          <Segmented
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "store", label: "By store" },
              { value: "aisle", label: "By aisle" },
            ]}
          />
        </div>
      </header>

      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="flex items-center gap-2 bg-muted/50 px-4 py-2 text-sm font-semibold">
            {g.store && <StoreBadge store={g.store} className="size-5" />}
            <span className="flex-1">{g.title}</span>
            {g.store && <span className="text-muted-foreground tabular-nums">≈ {money(groupTotal(g))}</span>}
          </h2>
          <ul className="divide-y">{g.items.map((i) => row(i, g.store))}</ul>
        </section>
      ))}
      {unchecked.length === 0 && <p className="px-4 pt-16 text-center text-lg font-semibold">All done! 🎉</p>}

      {checked.length > 0 && (
        <section className="mt-4 border-t">
          <button type="button" onClick={() => setShowTrolley((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-muted-foreground">
            <ChevronDown className={cn("size-4 transition-transform", !showTrolley && "-rotate-90")} />
            In the trolley · {checked.length}
          </button>
          {showTrolley && <ul className="divide-y">{checked.map((i) => row(i))}</ul>}
        </section>
      )}
    </div>
  );
}

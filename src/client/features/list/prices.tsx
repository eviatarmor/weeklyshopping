import { useQueries, useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { STORE_LABELS, type Offer, type PriceComparison, type Store } from "@/shared/grocery";
import type { ListItem } from "@/shared/types";
import { Skeleton } from "@/client/components/ui/misc";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";

const STORE_ICON: Record<Store, string> = { woolworths: "/stores/woolworths.png", coles: "/stores/coles.png" };
const STORES: Store[] = ["woolworths", "coles"];

const money = (n: number) => `$${n.toFixed(2)}`;
const unitText = (o: Offer) => (o.unitPrice != null && o.unitBasis ? `${money(o.unitPrice)}/${o.unitBasis === "each" ? "ea" : o.unitBasis}` : o.unitLabel);
const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

const PRICE_QUERY = { staleTime: 6 * 60 * 60_000, gcTime: 24 * 60 * 60_000, retry: 1, refetchOnWindowFocus: false } as const;

/** Cheapest vegetarian match for a list item at Woolworths or Coles (cached for a day on the server). */
export function usePrice(name: string, enabled = true) {
  const trpc = useTRPC();
  return useQuery(trpc.prices.compare.queryOptions({ name }, { ...PRICE_QUERY, enabled: enabled && name.trim().length >= 2 }));
}

export function StoreBadge({ store, className }: { store: Store; className?: string }) {
  return <img src={STORE_ICON[store]} alt={STORE_LABELS[store]} className={cn("size-4 shrink-0 rounded-sm object-contain", className)} />;
}

/**
 * Rough cost of a list item at this offer: "3 onions" at a per-each price is three of them;
 * anything else counts as one pack.
 */
function itemCost(item: ListItem, offer: Offer): number {
  const count = item.qty && !item.unit && offer.unitBasis === "each" ? Math.min(item.qty, 50) : 1;
  return offer.price * count;
}

/** "≈ $54 for 12 of 15 items" at the bottom of the list: cheapest of each, and all at one store. */
export function ListTotal({ items }: { items: ListItem[] }) {
  const trpc = useTRPC();
  const results = useQueries({
    queries: items.map((i) => trpc.prices.compare.queryOptions({ name: i.name }, { ...PRICE_QUERY, enabled: i.name.trim().length >= 2 })),
  });
  if (items.length === 0) return null;
  const loading = results.filter((r) => r.isPending).length;
  let cheapest = 0;
  let priced = 0;
  const perStore: Record<Store, { total: number; count: number }> = { woolworths: { total: 0, count: 0 }, coles: { total: 0, count: 0 } };
  results.forEach((r, index) => {
    const data = r.data as PriceComparison | undefined;
    const item = items[index]!;
    if (data?.cheapest) {
      cheapest += itemCost(item, data.cheapest);
      priced++;
    }
    for (const store of STORES) {
      const offer = data?.offers.find((o) => o.store === store);
      if (offer) {
        perStore[store].total += itemCost(item, offer);
        perStore[store].count++;
      }
    }
  });
  if (priced === 0 && loading === 0) return null;
  return (
    <section className="mx-4 mt-4 rounded-xl border bg-card p-3 md:mx-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Estimated total</h2>
        <span className="text-xl font-bold tabular-nums">≈ {money(cheapest)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Best buy for each item · {priced} of {items.length} priced{loading ? ` · checking ${loading} more…` : ""}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
        {STORES.map((store) => (
          <div key={store} className="flex items-center gap-2 text-sm">
            <StoreBadge store={store} className="size-5" />
            <span className="min-w-0">
              <span className="block font-semibold tabular-nums">≈ {money(perStore[store].total)}</span>
              <span className="block text-[11px] text-muted-foreground">
                all at {STORE_LABELS[store]} · {perStore[store].count} items
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Both stores' prices stacked next to a list item, the cheaper one highlighted.
 * Tapping a price opens that product on the store's website.
 */
export function PriceTag({ name }: { name: string }) {
  const { data, isPending } = usePrice(name);
  if (isPending) return <Skeleton className="h-9 w-16 shrink-0" />;
  if (!data?.offers.length) return null;
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {STORES.map((store) => {
        const offer = data.offers.find((o) => o.store === store);
        const best = offer != null && offer.productId === data.cheapest?.productId && offer.store === data.cheapest.store;
        if (!offer) {
          return (
            <span key={store} className="flex items-center gap-1 px-1.5 text-[11px] text-muted-foreground/60 tabular-nums">
              <StoreBadge store={store} className="size-3.5 opacity-40" /> –
            </span>
          );
        }
        return (
          <button
            key={store}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open(offer.url);
            }}
            aria-label={`${STORE_LABELS[store]}: ${money(offer.price)}${best ? " (best buy)" : ""}`}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] tabular-nums active:scale-95",
              best ? "bg-primary/10 font-bold text-primary ring-1 ring-primary/40" : "text-muted-foreground",
            )}
          >
            <StoreBadge store={store} className="size-3.5" />
            {money(offer.price)}
          </button>
        );
      })}
    </div>
  );
}

/** Full comparison for the item drawer: cheapest, best value, and each store's best match. */
export function PriceComparisonPanel({ name }: { name: string }) {
  const { data, isPending, isError } = usePrice(name);
  if (isPending) return <Skeleton className="h-28" />;
  if (isError) return <p className="text-sm text-muted-foreground">Couldn't get prices right now.</p>;
  if (!data?.offers.length) return <p className="text-sm text-muted-foreground">No vegetarian match found at Woolworths or Coles.</p>;
  const row = (o: Offer, label?: string) => (
    <li key={`${label ?? ""}${o.store}${o.productId}`}>
      <button type="button" onClick={() => open(o.url)} className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-accent">
        {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded object-contain" /> : <span className="size-10 shrink-0" />}
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[11px] font-semibold text-primary uppercase">{label}</span>}
          <span className="line-clamp-2 text-sm">{o.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <StoreBadge store={o.store} /> {unitText(o)}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-semibold tabular-nums">{money(o.price)}</span>
          {o.wasPrice && <span className="block text-[11px] text-muted-foreground line-through tabular-nums">{money(o.wasPrice)}</span>}
        </span>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
  const others = data.offers.filter((o) => o !== data.cheapest && o.productId !== data.cheapest?.productId && o.productId !== data.bestValue?.productId);
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {data.cheapest && row(data.cheapest, "Best buy")}
      {data.bestValue && data.bestValue.productId !== data.cheapest?.productId && row(data.bestValue, "Best value")}
      {others.map((o) => row(o))}
    </ul>
  );
}

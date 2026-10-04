import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { STORE_LABELS, type Offer, type Store } from "@/shared/grocery";
import { Skeleton } from "@/client/components/ui/misc";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";

const STORE_STYLE: Record<Store, string> = {
  woolworths: "bg-[#178841] text-white",
  coles: "bg-[#e01a22] text-white",
  iga: "bg-[#1d1d1b] text-white",
};
const STORE_SHORT: Record<Store, string> = { woolworths: "W", coles: "C", iga: "IGA" };

const money = (n: number) => `$${n.toFixed(2)}`;
const unitText = (o: Offer) => (o.unitPrice != null && o.unitBasis ? `${money(o.unitPrice)}/${o.unitBasis === "each" ? "ea" : o.unitBasis}` : o.unitLabel);
const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

/** Cheapest vegetarian match for a list item across Woolworths, Coles and IGA (cached for a day on the server). */
export function usePrice(name: string, enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.prices.compare.queryOptions(
      { name },
      { enabled: enabled && name.trim().length >= 2, staleTime: 6 * 60 * 60_000, gcTime: 24 * 60 * 60_000, retry: 1, refetchOnWindowFocus: false },
    ),
  );
}

export function StoreBadge({ store, className }: { store: Store; className?: string }) {
  return <span className={cn("rounded px-1 text-[10px] leading-4 font-bold", STORE_STYLE[store], className)}>{STORE_SHORT[store]}</span>;
}

/** "$0.63 W" next to a list item; tapping opens that product on the store's website. */
export function PriceTag({ name }: { name: string }) {
  const { data, isPending } = usePrice(name);
  if (isPending) return <Skeleton className="h-5 w-12 shrink-0" />;
  const offer = data?.cheapest;
  if (!offer) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(offer.url);
      }}
      aria-label={`Cheapest: ${money(offer.price)} at ${STORE_LABELS[offer.store]}`}
      className="flex shrink-0 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs font-semibold tabular-nums active:scale-95"
    >
      {money(offer.price)}
      <StoreBadge store={offer.store} />
    </button>
  );
}

/** Full comparison for the item drawer: cheapest, best value, and each store's best match. */
export function PriceComparisonPanel({ name }: { name: string }) {
  const { data, isPending, isError } = usePrice(name);
  if (isPending) return <Skeleton className="h-28" />;
  if (isError) return <p className="text-sm text-muted-foreground">Couldn't get prices right now.</p>;
  if (!data?.offers.length) return <p className="text-sm text-muted-foreground">No vegetarian match found at Woolworths, Coles or IGA.</p>;
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
      {data.cheapest && row(data.cheapest, "Cheapest")}
      {data.bestValue && data.bestValue.productId !== data.cheapest?.productId && row(data.bestValue, "Best value")}
      {others.map((o) => row(o))}
    </ul>
  );
}

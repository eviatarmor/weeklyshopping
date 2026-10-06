import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { ExternalLink, MoreVertical, Repeat } from "lucide-react";
import { STORE_LABELS, type Store } from "@/shared/grocery";
import { StoreBadge, usePrice } from "@/client/features/list/prices";
import { cn } from "@/client/lib/utils";

const STORES: Store[] = ["woolworths", "coles"];
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The ⋯ on a recipe ingredient: today's best price at each store (tap to open it there) and
 * "Substitutions". Prices are only looked up once the menu is opened.
 */
export function IngredientMenu({
  name,
  substitutions,
  swapped,
  onSubstitutions,
}: {
  name: string;
  substitutions: number;
  swapped: boolean;
  onSubstitutions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = usePrice(name, open);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`More for ${name}`}
          className={cn("grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent data-[state=open]:bg-accent", swapped && "text-primary")}
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-60 rounded-xl border bg-card p-1 text-sm shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{name}</DropdownMenu.Label>
          {STORES.map((store) => {
            const offer = data?.offers.find((o) => o.store === store);
            const best = offer != null && data?.cheapest?.productId === offer.productId;
            return (
              <DropdownMenu.Item
                key={store}
                disabled={!offer}
                onSelect={() => offer && window.open(offer.url, "_blank", "noopener,noreferrer")}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-60 data-[highlighted]:bg-accent"
              >
                <StoreBadge store={store} className="size-5" />
                <span className="min-w-0 flex-1 truncate">{offer ? offer.name : STORE_LABELS[store]}</span>
                <span className={cn("tabular-nums", best ? "font-bold text-primary" : "text-muted-foreground")}>
                  {offer ? money(offer.price) : isPending && open ? "…" : "–"}
                </span>
                {offer && <ExternalLink className="size-3.5 text-muted-foreground" />}
              </DropdownMenu.Item>
            );
          })}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            disabled={substitutions === 0}
            onSelect={onSubstitutions}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
          >
            <Repeat className="size-4" />
            <span className="flex-1">{substitutions ? "Substitutions" : "No substitutions"}</span>
            {substitutions > 0 && <span className="text-xs text-muted-foreground">{substitutions}</span>}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

import { formatQty } from "@/shared/units";
import type { ListItem } from "@/shared/types";
import { CheckCircle, Thumb } from "@/client/components/ui/misc";
import { emojiFor, sizedImage } from "@/client/lib/images";
import { cn } from "@/client/lib/utils";
import { PriceTag } from "./prices";

export function ItemRow({
  item,
  imageUrl,
  recipeTitle,
  onToggle,
  onOpen,
}: {
  item: ListItem;
  imageUrl: string | null;
  recipeTitle?: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const qty = formatQty(item.qty, item.unit);
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2 transition-opacity", item.checked && "opacity-55")}>
      <CheckCircle checked={item.checked} onClick={onToggle} aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.name}`} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Thumb src={sizedImage(item.imageUrl ?? imageUrl, 40)} emoji={emojiFor(item.name, item.sectionId)} className="size-10 text-lg" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-medium", item.checked && "line-through")}>{item.name}</span>
          {(item.note || recipeTitle) && (
            <span className="block truncate text-xs text-muted-foreground">
              {[item.note, recipeTitle && `for ${recipeTitle}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        {qty && <span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">{qty}</span>}
      </button>
      {!item.checked && <PriceTag name={item.name} />}
    </li>
  );
}

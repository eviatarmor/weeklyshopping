import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { formatQty } from "@/shared/units";
import type { ListItem } from "@/shared/types";
import { CheckCircle, Thumb } from "@/client/components/ui/misc";
import { emojiFor, sizedImage } from "@/client/lib/images";
import { cn, haptic } from "@/client/lib/utils";
import { PriceTag } from "./prices";

/** How far (px) to swipe before letting go deletes the item. */
const DELETE_AT = 110;

export function ItemRow({
  item,
  imageUrl,
  recipeTitle,
  onToggle,
  onOpen,
  onDelete,
}: {
  item: ListItem;
  imageUrl: string | null;
  recipeTitle?: string;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const qty = formatQty(item.qty, item.unit);
  const swipe = useSwipeToDelete(onDelete);
  return (
    <li className="relative overflow-hidden">
      {/* Revealed behind the row while swiping left. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-end gap-2 bg-destructive pr-5 text-sm font-semibold text-white transition-opacity",
          swipe.offset === 0 && "opacity-0",
        )}
      >
        <Trash2 className={cn("size-5 transition-transform", swipe.armed && "scale-125")} />
        Delete
      </div>
      <div
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)`, transition: swipe.dragging ? "none" : "transform 200ms ease-out" }}
        className={cn("relative flex touch-pan-y items-center gap-3 bg-background px-4 py-2 transition-opacity", item.checked && "opacity-55")}
      >
        <CheckCircle checked={item.checked} onClick={onToggle} aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.name}`} />
        <button type="button" onClick={() => !swipe.moved() && onOpen()} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
      </div>
    </li>
  );
}

/**
 * Swipe a row left to delete it, like a phone's mail app. Only a mostly-horizontal drag counts,
 * so scrolling the list up and down still works.
 */
function useSwipeToDelete(onDelete: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const horizontal = useRef<boolean | null>(null);
  const movedRef = useRef(false);
  const armed = offset <= -DELETE_AT;

  const reset = () => {
    start.current = null;
    horizontal.current = null;
    setDragging(false);
  };

  return {
    offset,
    dragging,
    armed,
    /** True right after a swipe, so the tap that ends it doesn't also open the item. */
    moved: () => movedRef.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        horizontal.current = null;
        movedRef.current = false;
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (horizontal.current === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          horizontal.current = Math.abs(dx) > Math.abs(dy) * 1.3;
          if (!horizontal.current) return reset();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
        }
        movedRef.current = true;
        const next = Math.min(0, dx);
        if ((next <= -DELETE_AT) !== (offset <= -DELETE_AT)) haptic(10);
        setOffset(next);
      },
      onPointerUp: () => {
        if (!start.current) return;
        const deleting = offset <= -DELETE_AT;
        reset();
        if (deleting) {
          setOffset(-window.innerWidth);
          setTimeout(onDelete, 180);
        } else {
          setOffset(0);
        }
        // Let the click that follows pointerup see that this was a swipe, then forget it.
        setTimeout(() => (movedRef.current = false), 50);
      },
      onPointerCancel: () => {
        reset();
        setOffset(0);
      },
    },
  };
}

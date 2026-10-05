import type * as React from "react";
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn, haptic } from "@/client/lib/utils";

/**
 * A list you reorder by dragging the grip on each row (touch or mouse).
 * Rows are assumed to be the same height, which keeps the maths simple.
 */
export function SortableList<T>({
  items,
  keyOf,
  labelOf,
  renderItem,
  onReorder,
  className,
}: {
  items: T[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onReorder: (items: T[]) => void;
  className?: string;
}) {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const start = useRef<{ y: number; height: number; index: number } | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onReorder(next);
  };

  return (
    <ul className={cn("relative divide-y rounded-xl border bg-card", className)}>
      {items.map((item, index) => {
        let shift = 0;
        if (drag && index !== drag.from) {
          if (drag.from < drag.to && index > drag.from && index <= drag.to) shift = -1;
          if (drag.from > drag.to && index < drag.from && index >= drag.to) shift = 1;
        }
        const dragging = drag?.from === index;
        return (
          <li
            key={keyOf(item)}
            style={{
              transform: dragging ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift * (start.current?.height ?? 0)}px)` : undefined,
              transition: dragging ? "none" : "transform 150ms ease",
            }}
            className={cn("relative flex items-center gap-3 bg-card px-3 py-2", dragging && "z-10 rounded-lg shadow-lg ring-1 ring-primary/40")}
          >
            <button
              type="button"
              aria-label={`Drag to move ${labelOf(item)}`}
              className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground active:cursor-grabbing active:bg-accent"
              onPointerDown={(e) => {
                const row = e.currentTarget.closest("li")!;
                start.current = { y: e.clientY, height: row.getBoundingClientRect().height, index };
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ from: index, to: index, dy: 0 });
                haptic(10);
              }}
              onPointerMove={(e) => {
                const s = start.current;
                if (!s || !drag) return;
                const dy = e.clientY - s.y;
                const to = Math.max(0, Math.min(items.length - 1, s.index + Math.round(dy / s.height)));
                if (to !== drag.to) haptic(5);
                setDrag({ from: s.index, to, dy });
              }}
              onPointerUp={() => {
                if (drag) move(drag.from, drag.to);
                start.current = null;
                setDrag(null);
              }}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
              // Keyboard: arrow keys move the row.
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && index > 0) move(index, index - 1);
                if (e.key === "ArrowDown" && index < items.length - 1) move(index, index + 1);
              }}
            >
              <GripVertical className="size-5" />
            </button>
            {renderItem(item)}
          </li>
        );
      })}
    </ul>
  );
}

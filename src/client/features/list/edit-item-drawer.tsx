import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { ListItem } from "@/shared/types";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { Input } from "@/client/components/ui/input";
import { cn } from "@/client/lib/utils";
import { PriceComparisonPanel } from "./prices";
import { RegularToggle } from "./regulars";
import { useCatalog, useListActions } from "./use-list";

export function EditItemDrawer({ item, onClose }: { item: ListItem | null; onClose: () => void }) {
  const actions = useListActions();
  const { sections } = useCatalog();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQty(item.qty != null ? String(item.qty) : "");
    setUnit(item.unit ?? "");
    setNote(item.note ?? "");
  }, [item]);

  if (!item) return null;

  const save = () => {
    const parsedQty = qty.trim() ? Number(qty) : null;
    actions.update(item.id, {
      name: name.trim() || item.name,
      qty: parsedQty != null && Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : null,
      unit: unit.trim() || null,
      note: note.trim() || null,
    });
    onClose();
  };

  const step = (delta: number) => {
    const current = Number(qty) || 0;
    const next = Math.max(0, current + delta);
    setQty(next ? String(next) : "");
  };

  return (
    <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit item</DrawerTitle>
          <DrawerDescription className="sr-only">Change name, quantity, section or delete</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Less">
              <Minus />
            </Button>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="Qty" className="w-20 text-center" aria-label="Quantity" />
            <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="More">
              <Plus />
            </Button>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit (g, ml, pack…)" className="flex-1" aria-label="Unit" />
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (brand, size…)" aria-label="Note" />
          <RegularToggle item={item} />
          {!item.checked && (
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Prices (vegetarian matches)</p>
              <PriceComparisonPanel name={item.name} />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Section</p>
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    actions.update(item.id, { sectionId: s.id });
                    onClose();
                  }}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                    s.id === item.sectionId ? "border-primary bg-accent font-medium" : "bg-card",
                  )}
                >
                  <span>{s.emoji}</span>
                  {s.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Moving an item remembers its section for next time.</p>
          </div>
        </div>
        <DrawerFooter className="flex-row">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              actions.remove([item.id]);
              onClose();
            }}
          >
            <Trash2 /> Delete
          </Button>
          <Button className="flex-1" onClick={save}>
            Save
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

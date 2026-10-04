import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { addDays, DAY_NAMES, dayIndex, weekStartOf } from "@/shared/week";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { Chip, Segmented } from "@/client/components/ui/misc";
import { useWeekActions } from "./use-week";

/** From a recipe page: pick this week or next, and a day (or "sometime"). */
export function AddToWeekDrawer({
  slug,
  title,
  servings,
  open,
  onOpenChange,
}: {
  slug: string;
  title: string;
  servings: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { add } = useWeekActions();
  const thisWeek = weekStartOf(new Date());
  const [week, setWeek] = useState<"this" | "next">("this");
  const [day, setDay] = useState<number | null>(null);
  const weekStart = week === "this" ? thisWeek : addDays(thisWeek, 7);
  const today = dayIndex(new Date());

  const save = () =>
    add.mutate(
      { weekStart, day, recipeSlug: slug, servings },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(`Added to ${day == null ? (week === "this" ? "this week" : "next week") : DAY_NAMES[day]}`, {
            action: { label: "View week", onClick: () => void navigate({ to: "/week", search: { w: weekStart } }) },
          });
        },
      },
    );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add to week</DrawerTitle>
          <DrawerDescription className="line-clamp-2">{title}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-4">
          <Segmented
            value={week}
            onChange={setWeek}
            options={[
              { value: "this", label: "This week" },
              { value: "next", label: "Next week" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Chip active={day == null} onClick={() => setDay(null)}>
              Sometime
            </Chip>
            {DAY_NAMES.map((name, i) => (
              <Chip key={name} active={day === i} onClick={() => setDay(i)} disabled={week === "this" && i < today} className="disabled:opacity-40">
                {name.slice(0, 3)}
              </Chip>
            ))}
          </div>
        </div>
        <DrawerFooter>
          <Button size="lg" onClick={save} disabled={add.isPending}>
            Add for {servings} people
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

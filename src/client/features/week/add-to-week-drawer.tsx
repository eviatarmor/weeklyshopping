import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { addDays, weekStartOf } from "@/shared/week";
import { Button } from "@/client/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/client/components/ui/drawer";
import { Segmented } from "@/client/components/ui/misc";
import { useWeekActions } from "./use-week";

/** From a recipe page: add it to this week's dinners or next week's. */
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
  const weekStart = week === "this" ? thisWeek : addDays(thisWeek, 7);

  const save = () =>
    add.mutate(
      { weekStart, day: null, recipeSlug: slug, servings },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(`Added to ${week === "this" ? "this week" : "next week"}`, {
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

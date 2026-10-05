import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { normalizeName } from "@/shared/normalize";
import type { ListItem } from "@/shared/types";
import { weekStartOf } from "@/shared/week";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";

export function useRegulars() {
  const trpc = useTRPC();
  return useQuery(trpc.household.regulars.queryOptions(undefined, { staleTime: Infinity }));
}

/** "Every week" switch in the item drawer. */
export function RegularToggle({ item }: { item: ListItem }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data } = useRegulars();
  const regular = (data ?? []).some((r) => r.normalizedName === normalizeName(item.name));
  const set = useMutation(
    trpc.household.setRegular.mutationOptions({
      onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.household.regulars.queryKey() }),
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={regular}
      onClick={() =>
        set.mutate({ name: item.name, regular: !regular, qty: item.qty, unit: item.unit, sectionId: item.sectionId, productSlug: item.productSlug })
      }
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left"
    >
      <Repeat className="size-5 text-muted-foreground" />
      <span className="flex-1">
        <span className="block text-sm font-medium">Add every week</span>
        <span className="block text-xs text-muted-foreground">Goes back on the list automatically each Monday</span>
      </span>
      <span className={cn("relative h-6 w-10 rounded-full transition-colors", regular ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", regular ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** Once a week (on the first visit from Monday on), put the regular items back on the list. */
export function useAddRegulars() {
  const trpc = useTRPC();
  const { data } = useRegulars();
  const add = useMutation(trpc.household.addRegulars.mutationOptions());
  const week = weekStartOf(new Date());
  const due = (data ?? []).some((r) => r.lastAddedWeek !== week);
  useEffect(() => {
    if (!due || sessionStorage.getItem("regulars-added") === week) return;
    sessionStorage.setItem("regulars-added", week);
    add.mutate(undefined, {
      onSuccess: ({ added }) => {
        if (added) toast.success(`Added ${added} regular item${added === 1 ? "" : "s"} for this week`);
      },
    });
  }, [due, week]); // eslint-disable-line react-hooks/exhaustive-deps
}

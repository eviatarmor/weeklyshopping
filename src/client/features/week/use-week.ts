import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC, type RouterOutputs } from "@/client/lib/trpc";

export type PlannedMeal = RouterOutputs["week"]["get"][number];

export function useWeek(weekStart: string) {
  const trpc = useTRPC();
  // Other devices' changes arrive over the live stream (week.changed), so no polling.
  return useQuery(trpc.week.get.queryOptions({ weekStart }, { staleTime: Infinity }));
}

/** Week mutations. Each one refreshes the affected weeks; the live stream updates other devices. */
export function useWeekActions() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries(trpc.week.pathFilter());
  const options = { onSuccess: refresh, onError: (e: { message: string }) => toast.error(e.message) };

  const add = useMutation(trpc.week.add.mutationOptions(options));
  const update = useMutation(trpc.week.update.mutationOptions(options));
  const remove = useMutation(trpc.week.remove.mutationOptions(options));
  const setCooked = useMutation(
    trpc.week.setCooked.mutationOptions({
      ...options,
      onMutate: async ({ id, cooked }) => {
        // Tick instantly; the server confirms.
        const filter = trpc.week.get.pathFilter();
        await qc.cancelQueries(filter);
        qc.setQueriesData<PlannedMeal[]>(filter, (old) => old?.map((m) => (m.id === id ? { ...m, cookedAt: cooked ? Date.now() : null } : m)));
      },
      onSuccess: () => {
        refresh();
        // Cooked counts feed the recipe stats and recommendations.
        void qc.invalidateQueries(trpc.recipes.pathFilter());
      },
    }),
  );
  const addToList = useMutation(trpc.week.addToList.mutationOptions({ onSuccess: refresh }));
  return { add, update, remove, setCooked, addToList };
}

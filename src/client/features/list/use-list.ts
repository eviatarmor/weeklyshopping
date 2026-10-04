import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import { buildProductIndex, classify } from "@/shared/classify";
import { capitalize, normalizeName } from "@/shared/normalize";
import { parseIngredient } from "@/shared/parse-ingredient";
import { addQuantities, normalizeUnit } from "@/shared/units";
import type { ListEvent, ListItem } from "@/shared/types";
import { useTRPC, type RouterOutputs } from "@/client/lib/trpc";
import { haptic } from "@/client/lib/utils";

export type Catalog = RouterOutputs["catalog"]["get"];

function upsertItems(list: ListItem[] | undefined, items: ListItem[], replaceId?: string): ListItem[] {
  const next = (list ?? []).filter((i) => i.id !== replaceId);
  for (const item of items) {
    const index = next.findIndex((i) => i.id === item.id);
    if (index === -1) next.push(item);
    else if (item.version >= next[index]!.version) next[index] = item;
  }
  return next;
}

function applyEvent(qc: QueryClient, listKey: QueryKey, catalogKey: QueryKey, event: ListEvent) {
  switch (event.type) {
    case "items.upsert":
      qc.setQueryData<ListItem[]>(listKey, (old) => upsertItems(old, event.items));
      break;
    case "items.delete":
      qc.setQueryData<ListItem[]>(listKey, (old) => old?.filter((i) => !event.ids.includes(i.id)));
      break;
    case "sections.changed":
    case "history.changed":
      void qc.invalidateQueries({ queryKey: catalogKey });
      break;
  }
}

/** Keeps the list cache in sync with other devices over SSE. Mounted once in the root layout. */
export function useListSync() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const listKey = trpc.list.get.queryKey();
  const catalogKey = trpc.catalog.get.queryKey();
  return useSubscription(
    trpc.list.onChange.subscriptionOptions(undefined, {
      // (Re)connected: anything could have changed while we were away.
      onStarted: () => {
        void qc.invalidateQueries({ queryKey: listKey });
        void qc.invalidateQueries({ queryKey: catalogKey });
      },
      onData: (event) => applyEvent(qc, listKey, catalogKey, event as ListEvent),
    }),
  );
}

export function useCatalog() {
  const trpc = useTRPC();
  const query = useQuery(trpc.catalog.get.queryOptions(undefined, { staleTime: 5 * 60_000 }));
  const derived = useMemo(() => {
    const data = query.data;
    const products = data?.products ?? [];
    return {
      sections: data?.sections ?? [],
      productIndex: buildProductIndex(products),
      productBySlug: new Map(products.map((p) => [p.slug, p])),
      historyByName: new Map((data?.history ?? []).map((h) => [h.normalizedName, h])),
    };
  }, [query.data]);
  return { ...query, ...derived };
}

export function useListItems() {
  const trpc = useTRPC();
  return useQuery(trpc.list.get.queryOptions());
}

export type AddInput = { text: string; productSlug?: string | null; sectionId?: string | null };

/** List mutations with optimistic updates; server events reconcile the final state. */
export function useListActions() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const listKey = trpc.list.get.queryKey();
  const catalog = useCatalog();

  const rollback = (error: { message: string }) => {
    toast.error(error.message || "Something went wrong");
    void qc.invalidateQueries({ queryKey: listKey });
  };

  const addMutation = useMutation(
    trpc.list.add.mutationOptions({
      onMutate: async (input) => {
        await qc.cancelQueries({ queryKey: listKey });
        const normalized = normalizeName(input.name);
        qc.setQueryData<ListItem[]>(listKey, (old = []) => {
          // Mirror the server: merge into an unchecked item with the same name when units allow.
          const target = old.find((i) => !i.checked && normalizeName(i.name) === normalized && addQuantities(i, { qty: input.qty ?? null, unit: input.unit ?? null }));
          if (target) {
            const sum = addQuantities(target, { qty: input.qty ?? null, unit: input.unit ?? null })!;
            return old.map((i) => (i.id === target.id ? { ...i, ...sum } : i));
          }
          const history = catalog.historyByName.get(normalized);
          const historySections = new Map(history?.sectionOverride ? [[normalized, history.sectionId]] : []);
          const guess = classify({ name: input.name, historySections, productIndex: catalog.productIndex });
          const product = input.productSlug ? catalog.productBySlug.get(input.productSlug) : undefined;
          const now = Date.now();
          return [
            ...old,
            {
              id: input.id!,
              name: capitalize(input.name),
              qty: input.qty ?? null,
              unit: normalizeUnit(input.unit),
              sectionId: input.sectionId ?? (history?.sectionOverride ? history.sectionId : (product?.sectionId ?? guess.sectionId)),
              productSlug: input.productSlug ?? guess.productSlug,
              imageUrl: null,
              checked: false,
              note: null,
              sourceRecipeSlug: null,
              addedBy: "",
              version: 0,
              createdAt: now,
              updatedAt: now,
            },
          ];
        });
      },
      onSuccess: (items, input) => {
        qc.setQueryData<ListItem[]>(listKey, (old) => upsertItems(old, items, items.some((i) => i.id === input.id) ? undefined : input.id));
      },
      onError: rollback,
    }),
  );

  const updateMutation = useMutation(
    trpc.list.update.mutationOptions({
      onMutate: async ({ id, patch }) => {
        await qc.cancelQueries({ queryKey: listKey });
        qc.setQueryData<ListItem[]>(listKey, (old) =>
          old?.map((i) =>
            i.id === id
              ? {
                  ...i,
                  ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
                  ...(patch.name ? { name: capitalize(patch.name) } : {}),
                }
              : i,
          ),
        );
      },
      onSuccess: (item) => {
        if (item) qc.setQueryData<ListItem[]>(listKey, (old) => upsertItems(old, [item]));
      },
      onError: rollback,
    }),
  );

  const removeMutation = useMutation(
    trpc.list.remove.mutationOptions({
      onMutate: async ({ ids }) => {
        await qc.cancelQueries({ queryKey: listKey });
        qc.setQueryData<ListItem[]>(listKey, (old) => old?.filter((i) => !ids.includes(i.id)));
      },
      onError: rollback,
    }),
  );

  const clearMutation = useMutation(
    trpc.list.clearChecked.mutationOptions({
      onMutate: async () => {
        await qc.cancelQueries({ queryKey: listKey });
        qc.setQueryData<ListItem[]>(listKey, (old) => old?.filter((i) => !i.checked));
      },
      onError: rollback,
    }),
  );

  return {
    add({ text, productSlug, sectionId }: AddInput) {
      const parsed = parseIngredient(text);
      const name = parsed.name || text.trim();
      if (!name) return;
      haptic();
      addMutation.mutate({
        id: crypto.randomUUID(),
        name,
        qty: parsed.qty,
        unit: parsed.unit,
        productSlug: productSlug ?? null,
        sectionId: sectionId ?? null,
        note: parsed.note,
      });
    },
    toggle(item: ListItem) {
      haptic(item.checked ? 5 : 12);
      updateMutation.mutate({ id: item.id, patch: { checked: !item.checked } });
    },
    update: (id: string, patch: Parameters<typeof updateMutation.mutate>[0]["patch"]) => updateMutation.mutate({ id, patch }),
    remove: (ids: string[]) => removeMutation.mutate({ ids }),
    clearChecked: () => clearMutation.mutate(),
  };
}

import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Clock, Search } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/client/components/page-header";
import { KitchenDrawer, useKitchen } from "@/client/features/recipes/kitchen";
import { cn } from "@/client/lib/utils";
import { Chip, Segmented, Skeleton, Stars, Thumb } from "@/client/components/ui/misc";
import { sizedImage } from "@/client/lib/images";
import { useTRPC } from "@/client/lib/trpc";
import { Energy } from "@/client/features/recipes/energy";

// Every filter lives in the URL, so coming back from a recipe shows exactly the same list.
const searchSchema = z.object({
  kind: z.enum(["meal", "blend"]).optional().catch(undefined),
  sort: z.enum(["top", "foryou", "kitchen", "cheap", "new", "untried", "quick"]).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  source: z.string().optional().catch(undefined),
  type: z.enum(["spice", "sauce"]).optional().catch(undefined),
});

export const Route = createFileRoute("/recipes/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RecipesPage,
});

const SORTS = [
  { value: "top", label: "Top rated" },
  { value: "foryou", label: "For you" },
  { value: "kitchen", label: "What can I make?" },
  { value: "cheap", label: "Cheapest" },
  { value: "new", label: "Newest" },
  { value: "untried", label: "Not tried" },
  { value: "quick", label: "Quick" },
] as const;

const BLEND_TYPES = [
  { value: undefined, label: "All" },
  { value: "spice", label: "Spice mixes" },
  { value: "sauce", label: "Sauces & pastes" },
] as const;

const PAGE_SIZE = 40;

type Search = z.infer<typeof searchSchema>;
/** Meals and blends each keep their own filters when you switch between the tabs. */
const savedByKind: Partial<Record<"meal" | "blend", Search>> = {};

function RecipesPage() {
  const trpc = useTRPC();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const kind = search.kind ?? "meal";
  const sort = search.sort ?? "top";
  const { tag, source, type } = search;
  const setSearch = (patch: Partial<Search>) => void navigate({ search: (s: Search) => ({ ...s, ...patch }), replace: true });

  // The box updates instantly; the URL (and the request) follow a moment later.
  const [text, setText] = useState(search.q ?? "");
  const { data: kitchen } = useKitchen();
  const [editingKitchen, setEditingKitchen] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? "") !== text) setSearch({ q: text || undefined });
    }, 250);
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useInfiniteQuery(
    trpc.recipes.list.infiniteQueryOptions(
      { kind, sort, query: search.q, tag, source, blendType: kind === "blend" ? type : undefined, limit: PAGE_SIZE },
      {
        getNextPageParam: (page) => page.nextCursor,
        placeholderData: keepPreviousData,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    ),
  );
  const pages = query.data?.pages ?? [];
  const visible = pages.flatMap((p) => p.items);
  const total = pages[0]?.total;
  // Chips come with the first page; keep the last ones while the next filter loads.
  const facets = pages[0]?.facets;

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visible.length]);

  const filtering = Boolean(search.q || tag || source);

  return (
    <div className="md:mx-auto md:max-w-7xl md:pt-4">
      <PageHeader
        title="Recipes"
        action={
          <Segmented
            value={kind}
            onChange={(k) => {
              savedByKind[kind] = { ...search, q: text || undefined };
              const next = { ...savedByKind[k], kind: k };
              setText(next.q ?? "");
              void navigate({ search: next });
            }}
            options={[
              { value: "meal", label: "Meals" },
              { value: "blend", label: "Blends" },
            ]}
          />
        }
      >
        <div className="px-4 pb-2">
          <label className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === "meal" ? `Search ${total != null && !filtering ? total : ""} recipes` : "Search blends and sauces"}
              className="h-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        {kind === "blend" && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 md:px-6">
            {BLEND_TYPES.map((t) => (
              <Chip key={t.label} active={type === t.value} onClick={() => setSearch({ type: t.value })}>
                {t.label}
              </Chip>
            ))}
          </div>
        )}
        {kind === "meal" && facets && facets.sources.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 md:flex-wrap md:overflow-visible md:px-6">
            <Chip active={!source} onClick={() => setSearch({ source: undefined })}>
              All sources
            </Chip>
            {facets.sources.map(({ id, label, count }) => (
              <Chip key={id} active={source === id} onClick={() => setSearch({ source: source === id ? undefined : id })}>
                {label} <span className="opacity-60">{count}</span>
              </Chip>
            ))}
          </div>
        )}
        {kind === "meal" && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 md:flex-wrap md:overflow-visible md:px-6">
            {SORTS.map((s) => (
              <Chip key={s.value} active={sort === s.value} onClick={() => setSearch({ sort: s.value })}>
                {s.label}
              </Chip>
            ))}
            <span className="w-px shrink-0 bg-border" />
            {facets?.tags.map((t) => (
              <Chip key={t} active={tag === t} onClick={() => setSearch({ tag: tag === t ? undefined : t })} className="capitalize">
                {t}
              </Chip>
            ))}
          </div>
        )}
      </PageHeader>

      {kind === "meal" && sort === "kitchen" && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-sm md:mx-6">
          <span className="text-muted-foreground">
            {kitchen?.length ? `Using the ${kitchen.length} things in your kitchen` : "Tell the app what's in your kitchen first"}
          </span>
          <button type="button" onClick={() => setEditingKitchen(true)} className="shrink-0 font-semibold text-primary">
            {kitchen?.length ? "Edit kitchen" : "Add items"}
          </button>
        </div>
      )}
      <KitchenDrawer open={editingKitchen} onOpenChange={setEditingKitchen} />

      <div className="grid grid-cols-2 gap-3 px-4 pt-1 pb-6 sm:grid-cols-3 md:gap-4 md:px-6 lg:grid-cols-4 xl:grid-cols-5">
        {query.isPending && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
        {visible.map((r) => (
          <Link key={r.slug} to="/recipes/$slug" params={{ slug: r.slug }} className="group overflow-hidden rounded-xl border bg-card shadow-xs active:scale-[0.98]">
            <div className="relative">
              <Thumb
                src={sizedImage(r.imageUrl, 220)}
                emoji={kind === "meal" ? "🍽️" : r.tags.includes("sauce") ? "🥫" : "🧂"}
                className="aspect-[4/3] w-full rounded-none text-3xl [&_img]:object-cover"
                alt={r.title}
              />
              {kind === "meal" && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                  {r.source.label}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 p-2.5">
              <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{r.title}</h3>
              {r.because && <p className="line-clamp-1 text-[11px] text-muted-foreground">Because you liked {r.because}</p>}
              {r.missing != null && (
                <p className={cn("text-[11px] font-semibold", r.missing === 0 ? "text-primary" : "text-muted-foreground")}>
                  {r.missing === 0 ? "You have everything" : `Missing ${r.missing} ingredient${r.missing === 1 ? "" : "s"}`}
                </p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {r.avgStars != null ? <Stars value={r.avgStars} size="sm" /> : <span>{r.timesCooked ? `Cooked ${r.timesCooked}×` : "Not rated"}</span>}
                {r.prepMinutes != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {r.prepMinutes}m
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Energy kcal={r.kcal} className="text-xs text-muted-foreground [&_svg]:size-3" />
                {r.costPerServe != null && <span className="text-xs font-medium text-muted-foreground tabular-nums">${r.costPerServe.toFixed(2)}/serve</span>}
              </div>
            </div>
          </Link>
        ))}
        {query.isError && (
          <p className="col-span-full pt-12 text-center text-sm text-destructive">Couldn't load recipes. Check your connection and try again.</p>
        )}
        {query.isSuccess && visible.length === 0 && (
          <p className="col-span-full pt-12 text-center text-sm text-muted-foreground">
            {sort === "foryou" && kind === "meal" && !filtering
              ? "Rate a few recipes you've cooked (4–5★ for favourites) and you'll get recommendations here."
              : sort === "cheap" && kind === "meal"
                ? "Costs are still being worked out: ingredient prices fill in over the next day or two."
                : "No recipes match."}
          </p>
        )}
        {isFetchingNextPage && Array.from({ length: 4 }, (_, i) => <Skeleton key={`more-${i}`} className="aspect-[4/5]" />)}
        {hasNextPage && <div ref={sentinel} className="col-span-full h-10" />}
      </div>
    </div>
  );
}

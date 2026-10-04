import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Search } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/client/components/page-header";
import { Chip, Segmented, Skeleton, Stars, Thumb } from "@/client/components/ui/misc";
import { useRecipeCards, type RecipeCard } from "@/client/features/recipes/use-recipes";
import { sizedImage } from "@/client/lib/images";
import { Energy } from "@/client/features/recipes/energy";
import { Recommended } from "@/client/features/recipes/recommended";

const searchSchema = z.object({
  kind: z.enum(["meal", "blend"]).optional().catch(undefined),
  sort: z.enum(["top", "new", "untried", "quick"]).optional().catch(undefined),
});
type Sort = NonNullable<z.infer<typeof searchSchema>["sort"]>;
type Kind = "meal" | "blend";

/** Each tab (meals / blends) keeps its own search, source and tag filters. */
type Filters = { query: string; tag: string | null; source: string | null };
const NO_FILTERS: Filters = { query: "", tag: null, source: null };

export const Route = createFileRoute("/recipes/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RecipesPage,
});

type RecipeSummary = RecipeCard;

const SORTS = [
  { value: "top", label: "Top rated" },
  { value: "new", label: "Newest" },
  { value: "untried", label: "Not tried" },
  { value: "quick", label: "Quick" },
] as const;

/** Tags that describe where a recipe came from rather than what it is. */
// Source names, plus tags that duplicate the sort chips ("Quick").
const NON_FILTER_TAGS = new Set(["hellofresh", "everyplate", "mealime", "dinnerly", "reddit", "blend", "vegetarian", "quick"]);
const PAGE_SIZE = 40;

function sortRecipes(list: RecipeSummary[], sort: Sort) {
  const copy = [...list];
  switch (sort) {
    case "top":
      return copy.sort((a, b) => (b.avgStars ?? 0) - (a.avgStars ?? 0) || b.timesCooked - a.timesCooked || a.title.localeCompare(b.title));
    case "new":
      return copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.title.localeCompare(b.title));
    case "untried":
      return copy.filter((r) => r.timesCooked === 0 && r.ratingCount === 0).sort((a, b) => a.title.localeCompare(b.title));
    case "quick":
      return copy.filter((r) => r.prepMinutes != null).sort((a, b) => a.prepMinutes! - b.prepMinutes! || a.title.localeCompare(b.title));
  }
}

function RecipesPage() {
  const search = Route.useSearch();
  const kind = search.kind ?? "meal";
  const sort = search.sort ?? "top";
  const navigate = Route.useNavigate();
  const [filtersByKind, setFiltersByKind] = useState<Record<Kind, Filters>>({ meal: NO_FILTERS, blend: NO_FILTERS });
  const { query, tag, source } = filtersByKind[kind];
  const setFilters = (patch: Partial<Filters>) => setFiltersByKind((all) => ({ ...all, [kind]: { ...all[kind], ...patch } }));
  const [shown, setShown] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);
  const { cards, isPending, error } = useRecipeCards();
  const data = useMemo(() => cards.filter((r) => r.kind === kind), [cards, kind]);

  const sources = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of data ?? []) {
      const entry = counts.get(r.source.id) ?? { label: r.source.label, count: 0 };
      entry.count++;
      counts.set(r.source.id, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [data]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of data ?? []) for (const t of r.tags) if (!NON_FILTER_TAGS.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
  }, [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (data ?? []).filter(
      (r) =>
        (!q || `${r.title} ${r.subtitle ?? ""}`.toLowerCase().includes(q)) &&
        (!tag || r.tags.includes(tag)) &&
        (!source || r.source.id === source),
    );
    return kind === "meal" ? sortRecipes(filtered, sort) : filtered.sort((a, b) => a.title.localeCompare(b.title));
  }, [data, query, tag, sort, kind, source]);

  // Reset paging when the filters change, then grow as the user scrolls.
  useEffect(() => setShown(PAGE_SIZE), [query, tag, sort, kind, source]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setShown((n) => n + PAGE_SIZE);
    }, { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible.length]);

  return (
    <div className="md:mx-auto md:max-w-7xl md:pt-4">
      <PageHeader
        title="Recipes"
        action={
          <Segmented
            value={kind}
            onChange={(k) => void navigate({ search: (s) => ({ ...s, kind: k }) })}
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
              value={query}
              onChange={(e) => setFilters({ query: e.target.value })}
              placeholder={kind === "meal" ? `Search ${data?.length ?? ""} recipes` : "Search blends"}
              className="h-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        {sources.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 md:flex-wrap md:overflow-visible md:px-6">
            <Chip active={!source} onClick={() => setFilters({ source: null })}>
              All sources
            </Chip>
            {sources.map(([id, { label, count }]) => (
              <Chip key={id} active={source === id} onClick={() => setFilters({ source: source === id ? null : id })}>
                {label} <span className="opacity-60">{count}</span>
              </Chip>
            ))}
          </div>
        )}
        {kind === "meal" && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 md:flex-wrap md:overflow-visible md:px-6">
            {SORTS.map((s) => (
              <Chip key={s.value} active={sort === s.value} onClick={() => void navigate({ search: (p) => ({ ...p, sort: s.value }) })}>
                {s.label}
              </Chip>
            ))}
            <span className="w-px shrink-0 bg-border" />
            {tags.map((t) => (
              <Chip key={t} active={tag === t} onClick={() => setFilters({ tag: tag === t ? null : t })} className="capitalize">
                {t}
              </Chip>
            ))}
          </div>
        )}
      </PageHeader>

      {kind === "meal" && !query && !tag && !source && <Recommended />}

      <div className="grid grid-cols-2 gap-3 px-4 pt-1 pb-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-4 md:px-6">
        {isPending && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
        {visible.slice(0, shown).map((r) => (
          <Link key={r.slug} to="/recipes/$slug" params={{ slug: r.slug }} className="group overflow-hidden rounded-xl border bg-card shadow-xs active:scale-[0.98]">
            <div className="relative">
              <Thumb
                src={sizedImage(r.imageUrl, 220)}
                emoji={kind === "blend" ? "🧂" : "🍽️"}
                className="aspect-[4/3] w-full rounded-none text-3xl [&_img]:object-cover"
                alt={r.title}
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                {r.source.label}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-2.5">
              <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{r.title}</h3>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {r.avgStars != null ? <Stars value={r.avgStars} size="sm" /> : <span>{r.timesCooked ? `Cooked ${r.timesCooked}×` : "Not rated"}</span>}
                {r.prepMinutes != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {r.prepMinutes}m
                  </span>
                )}
              </div>
              <Energy kcal={r.kcal} className="text-xs text-muted-foreground [&_svg]:size-3" />
            </div>
          </Link>
        ))}
        {error && <p className="col-span-2 pt-12 text-center text-sm text-destructive">Couldn't load recipes. Check your connection and pull to refresh.</p>}
        {!isPending && !error && visible.length === 0 && <p className="col-span-2 pt-12 text-center text-sm text-muted-foreground">No recipes match.</p>}
        {shown < visible.length && <div ref={sentinel} className="col-span-2 h-10" />}
      </div>
    </div>
  );
}

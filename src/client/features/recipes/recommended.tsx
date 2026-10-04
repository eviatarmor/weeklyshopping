import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Thumb } from "@/client/components/ui/misc";
import { sizedImage } from "@/client/lib/images";
import { useTRPC } from "@/client/lib/trpc";
import { Energy } from "./energy";
import { useRecipeCards } from "./use-recipes";

/** "Recommended for you": meals similar to the ones you rated highly. */
export function Recommended() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.recipes.recommended.queryOptions(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false }));
  const { bySlug } = useRecipeCards();
  if (!data) return null;
  // The API returns slugs; card details come from the static recipe index.
  const items = data.items.flatMap((i) => {
    const card = bySlug.get(i.slug);
    return card ? [{ ...card, because: i.because }] : [];
  });

  if (items.length === 0) {
    return (
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-dashed bg-card p-3 text-sm text-muted-foreground">
        <Sparkles className="size-5 shrink-0 text-primary" />
        Rate a few recipes you've cooked (4–5★ for favourites) and you'll get recommendations here.
      </div>
    );
  }

  return (
    <section className="mb-3">
      <h2 className="flex items-center gap-1.5 px-4 pb-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" /> Recommended for you
      </h2>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {items.map((r) => (
          <Link
            key={r.slug}
            to="/recipes/$slug"
            params={{ slug: r.slug }}
            className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border bg-card shadow-xs active:scale-[0.98]"
          >
            <Thumb src={sizedImage(r.imageUrl, 160)} emoji="🍽️" className="aspect-[4/3] w-full rounded-none text-2xl [&_img]:object-cover" alt={r.title} />
            <div className="space-y-0.5 p-2">
              <h3 className="line-clamp-2 text-xs leading-snug font-semibold">{r.title}</h3>
              {r.because && <p className="line-clamp-1 text-[11px] text-muted-foreground">Because you liked {r.because}</p>}
              <Energy kcal={r.kcal} className="text-[11px] text-muted-foreground [&_svg]:size-3" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellRing, ChefHat, Timer, X } from "lucide-react";
import { formatCountdown } from "@/shared/timers";
import { Thumb } from "@/client/components/ui/misc";
import { useRecipeDetail } from "@/client/features/recipes/use-recipes";
import { sizedImage } from "@/client/lib/images";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";
import { stopCooking, type CookingSession } from "./cooking";
import { useNow, useTimers } from "./use-timers";

/** The recipe being cooked, minimised above the tab bar (like a music player). Tap to go back to it. */
export function CookingBar({ session, aboveTabs }: { session: CookingSession; aboveTabs: boolean }) {
  const trpc = useTRPC();
  const detail = useRecipeDetail(session.slug);
  const progress = useQuery(trpc.recipes.progress.queryOptions({ slug: session.slug }, { staleTime: Infinity }));
  const total = detail.data?.recipe.steps.length ?? 0;
  const done = progress.data?.steps.length ?? 0;
  // The first step that isn't ticked yet is the one you're on.
  const current = total ? Array.from({ length: total }, (_, i) => i).find((i) => !progress.data?.steps.includes(i)) : undefined;
  // The timer that needs attention first: one that's up, else the soonest running one.
  const timers = useTimers().data ?? [];
  const now = useNow(timers.length > 0);
  const timer = timers.find((t) => t.firedAt != null || t.endsAt <= now) ?? timers.find((t) => t.firedAt == null);
  const timerUp = timer != null && (timer.firedAt != null || timer.endsAt <= now);

  return (
    <div
      className={cn(
        "fixed inset-x-0 z-40 mx-auto max-w-md px-2 md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:px-0",
        // Above the tab bar, or above the "Add ingredients" bar on another recipe's page.
        aboveTabs ? "bottom-[calc(4rem+env(safe-area-inset-bottom)+0.25rem)]" : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
      )}
    >
      <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border bg-card/95 p-2 pr-1 shadow-lg backdrop-blur-lg">
        <Link to="/recipes/$slug" params={{ slug: session.slug }} className="flex min-w-0 flex-1 items-center gap-3">
          <Thumb src={sizedImage(session.imageUrl, 96)} emoji="🍳" className="size-11 [&_img]:object-cover" alt="" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
              <ChefHat className="size-3.5" /> Cooking · screen stays on
            </span>
            <span className="block truncate text-sm font-semibold">{session.title}</span>
            {timer ? (
              <span className={cn("flex items-center gap-1 text-xs font-semibold", timerUp ? "text-destructive" : "text-foreground")}>
                {timerUp ? <BellRing className="size-3.5" /> : <Timer className="size-3.5" />}
                <span className="truncate">{timer.label}</span>
                <span className="tabular-nums">· {timerUp ? "time's up!" : formatCountdown(timer.endsAt - now)}</span>
              </span>
            ) : (
              total > 0 && (
                <span className="block text-xs text-muted-foreground">
                  {current === undefined ? "All steps done" : `Step ${current + 1} of ${total}`}
                </span>
              )
            )}
          </span>
        </Link>
        <button type="button" aria-label="Stop cooking" onClick={stopCooking} className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent">
          <X className="size-5" />
        </button>
        {total > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
            <span className="block h-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </span>
        )}
      </div>
    </div>
  );
}

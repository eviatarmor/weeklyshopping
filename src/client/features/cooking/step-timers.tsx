import { BellRing, Plus, Timer, X } from "lucide-react";
import { formatCountdown, type StepTimer } from "@/shared/timers";
import { cn, haptic } from "@/client/lib/utils";
import { useTimerActions, type CookingTimer } from "./use-timers";

/** "Start 'Cook the rice' 10:00" buttons under a method step; a running timer counts down in place. */
export function StepTimers({
  slug,
  suggestions,
  timers,
  now,
}: {
  slug: string;
  suggestions: StepTimer[];
  timers: CookingTimer[];
  now: number;
}) {
  const { start, extend, remove } = useTimerActions();
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
      {suggestions.map((s) => {
        // The newest timer started from this suggestion, if any.
        const timer = timers.filter((t) => t.recipeSlug === slug && t.label === s.label).at(-1);
        const left = timer ? timer.endsAt - now : 0;
        const finished = timer != null && (timer.firedAt != null || left <= 0);
        if (!timer) {
          return (
            <button
              key={s.label + s.seconds}
              type="button"
              onClick={() => {
                haptic(12);
                start({ recipeSlug: slug, label: s.label, seconds: s.seconds });
              }}
              className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left active:scale-[0.99]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
                <Timer className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Start "{s.label}"</span>
              <span className="text-base font-bold tabular-nums">{formatCountdown(s.seconds * 1000)}</span>
            </button>
          );
        }
        return (
          <div
            key={s.label + s.seconds}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2",
              finished ? "animate-pulse border-destructive bg-destructive/10" : "border-primary bg-primary/10",
            )}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", finished ? "bg-destructive text-white" : "bg-primary text-primary-foreground")}>
              {finished ? <BellRing className="size-4" /> : <Timer className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{s.label}</span>
              <span className="block text-xs text-muted-foreground">{finished ? "Time's up!" : "Running"}</span>
            </span>
            <span className="text-lg font-bold tabular-nums">{finished ? "0:00" : formatCountdown(left)}</span>
            <button type="button" aria-label="Add a minute" onClick={() => extend(timer.id, 60)} className="grid size-8 place-items-center rounded-full active:bg-accent">
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              aria-label={finished ? "Dismiss timer" : "Stop timer"}
              onClick={() => remove(timer.id)}
              className="grid size-8 place-items-center rounded-full active:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

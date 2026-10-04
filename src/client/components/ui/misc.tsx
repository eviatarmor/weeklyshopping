import type * as React from "react";
import { useState } from "react";
import { Check, Star } from "lucide-react";
import { cn } from "@/client/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground", className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />;
}

const checkClasses = (checked: boolean, className?: string) =>
  cn(
    "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors active:scale-90",
    checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-card",
    className,
  );

/** Round check used for list items. */
export function CheckCircle({ checked, className, ...props }: { checked: boolean } & React.ComponentProps<"button">) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className={checkClasses(checked, className)} {...props}>
      {checked && <Check className="size-4" strokeWidth={3} />}
    </button>
  );
}

/** Visual-only check for rows that are themselves the clickable control. */
export function CheckIndicator({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span aria-hidden className={checkClasses(checked, className)}>
      {checked && <Check className="size-4" strokeWidth={3} />}
    </span>
  );
}

export function Chip({ active, className, ...props }: { active?: boolean } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-3 text-xs font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stars({
  value,
  onChange,
  size = "md",
}: {
  value: number | null;
  onChange?: (stars: number | null) => void;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "sm" ? "size-3.5" : size === "lg" ? "size-8" : "size-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = value != null && n <= Math.round(value);
        const icon = <Star className={cn(px, fill ? "fill-star text-star" : "text-muted-foreground/40")} />;
        return onChange ? (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-0.5 active:scale-90"
            onClick={() => onChange(value === n ? null : n)}
          >
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        );
      })}
    </div>
  );
}

/** Image with an emoji fallback when the remote URL is missing or broken. */
export function Thumb({
  src,
  emoji,
  className,
  alt = "",
}: {
  src: string | null | undefined;
  emoji: string;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted", className)}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="text-[1.3em] leading-none">{emoji}</span>
      )}
    </div>
  );
}

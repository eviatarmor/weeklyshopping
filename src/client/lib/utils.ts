import { useSyncExternalStore } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function haptic(ms = 8) {
  if ("vibrate" in navigator) navigator.vibrate?.(ms);
}

export function timeAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

const DESKTOP_QUERY = "(min-width: 768px)";

/** True on tablet/desktop widths (Tailwind's `md` breakpoint), live-updating on resize. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

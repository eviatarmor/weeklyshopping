import { useEffect, useSyncExternalStore } from "react";

/** The recipe being cooked on this phone. Kept in localStorage so it survives reloads. */
export type CookingSession = { slug: string; title: string; imageUrl: string | null; people: number; startedAt: number };

const KEY = "cooking-session";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: CookingSession | null } = { raw: null, value: null };

function read(): CookingSession | null {
  const raw = localStorage.getItem(KEY);
  if (raw !== cached.raw) {
    let value: CookingSession | null = null;
    try {
      value = raw ? (JSON.parse(raw) as CookingSession) : null;
    } catch {
      value = null;
    }
    cached = { raw, value };
  }
  return cached.value;
}

function write(session: CookingSession | null) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export const startCooking = (session: Omit<CookingSession, "startedAt">) => write({ ...session, startedAt: Date.now() });
export const stopCooking = () => write(null);
export const setCookingPeople = (people: number) => {
  const current = read();
  if (current) write({ ...current, people });
};

export function useCooking(): CookingSession | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => null,
  );
}

/**
 * Keep the screen on while `active`. Browsers drop the lock whenever the app is
 * hidden, so it's requested again each time the app comes back.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Not allowed right now (e.g. battery saver); try again next time the app is shown.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [active]);
}

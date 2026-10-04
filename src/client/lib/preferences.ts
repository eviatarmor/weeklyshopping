import { useSyncExternalStore } from "react";
import type { MeasureSystem } from "@/shared/measure";

const KEY = "measure-system";
const listeners = new Set<() => void>();

function read(): MeasureSystem {
  return localStorage.getItem(KEY) === "grams" ? "grams" : "spoons";
}

/** Spoons or grams for recipe quantities; remembered per device and shared across screens. */
export function useMeasureSystem(): [MeasureSystem, (system: MeasureSystem) => void] {
  const system = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => "spoons" as const,
  );
  const set = (next: MeasureSystem) => {
    localStorage.setItem(KEY, next);
    listeners.forEach((l) => l());
  };
  return [system, set];
}

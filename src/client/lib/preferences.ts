import { useSyncExternalStore } from "react";
import type { MeasureSystem } from "@/shared/measure";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** A small per-device setting kept in localStorage and shared across screens. */
function usePreference<T extends string>(key: string, values: readonly T[], fallback: T): [T, (value: T) => void] {
  const read = () => {
    const stored = localStorage.getItem(key);
    return (values as readonly string[]).includes(stored ?? "") ? (stored as T) : fallback;
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = (next: T) => {
    localStorage.setItem(key, next);
    listeners.forEach((l) => l());
  };
  return [value, set];
}

/** Spoons or grams for recipe quantities. */
export const useMeasureSystem = () => usePreference<MeasureSystem>("measure-system", ["spoons", "grams"], "spoons");

export type EnergyUnit = "kj" | "kcal";
/** Kilojoules (the Australian default) or kilocalories. */
export const useEnergyUnit = () => usePreference<EnergyUnit>("energy-unit", ["kj", "kcal"], "kj");

export function formatEnergy(kcal: number, unit: EnergyUnit): string {
  return unit === "kj" ? `${(Math.round((kcal * 4.184) / 10) * 10).toLocaleString("en-AU")} kJ` : `${Math.round(kcal).toLocaleString("en-AU")} kcal`;
}

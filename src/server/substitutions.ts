import data from "../../content/substitutions.json";
import type { Substitution } from "@/shared/recipe-types";

const table = data as Record<string, Substitution[]>;

/**
 * Swaps for an ingredient name: an exact match first, then without leading descriptors
 * ("fresh baby spinach" → "baby spinach" → "spinach").
 */
export function substitutionsFor(name: string): Substitution[] {
  const words = name.toLowerCase().trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const key = words.slice(i).join(" ");
    const found = table[key] ?? table[key.replace(/(es|s)$/, "")] ?? table[`${key}s`];
    if (found?.length) return found;
  }
  return [];
}

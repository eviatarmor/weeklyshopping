import { normalizeName } from "./normalize";

const stem = (w: string) => w.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : ""));
const words = (name: string) => normalizeName(name).split(" ").filter(Boolean).map(stem);

/**
 * Does something in the kitchen cover this ingredient? "Onions" covers "Brown Onion",
 * "Feta" covers "Greek Feta Cheese"; every word of the kitchen item has to appear.
 */
export function makeKitchenMatcher(kitchen: string[]): (ingredient: string) => boolean {
  const items = kitchen.map(words).filter((w) => w.length);
  return (ingredient) => {
    const have = new Set(words(ingredient));
    return items.some((item) => item.every((w) => have.has(w)));
  };
}

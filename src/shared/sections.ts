export type Section = { id: string; name: string; emoji: string };

/** Default AU supermarket sections, in a typical walk-through order. */
export const DEFAULT_SECTIONS: Section[] = [
  { id: "fruit-veg", name: "Fruit & Veg", emoji: "🥦" },
  { id: "meat-seafood", name: "Meat & Seafood", emoji: "🥩" },
  { id: "deli", name: "Deli", emoji: "🧀" },
  { id: "dairy-eggs", name: "Dairy & Eggs", emoji: "🥛" },
  { id: "bakery", name: "Bakery", emoji: "🍞" },
  { id: "pantry", name: "Pantry", emoji: "🥫" },
  { id: "herbs-spices", name: "Herbs & Spices", emoji: "🌶️" },
  { id: "international", name: "International", emoji: "🌏" },
  { id: "frozen", name: "Frozen", emoji: "🧊" },
  { id: "snacks", name: "Snacks", emoji: "🍫" },
  { id: "drinks", name: "Drinks", emoji: "🧃" },
  { id: "household", name: "Household", emoji: "🧻" },
  { id: "other", name: "Other", emoji: "🛒" },
];

export const SECTION_IDS = DEFAULT_SECTIONS.map((s) => s.id);
export const FALLBACK_SECTION = "other";

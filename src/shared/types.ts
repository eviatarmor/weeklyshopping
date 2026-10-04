export type ListItem = {
  id: string;
  name: string;
  qty: number | null;
  unit: string | null;
  sectionId: string;
  productSlug: string | null;
  imageUrl: string | null;
  checked: boolean;
  note: string | null;
  sourceRecipeSlug: string | null;
  addedBy: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type ListEvent =
  | { type: "items.upsert"; items: ListItem[] }
  | { type: "items.delete"; ids: string[] }
  | { type: "sections.changed" }
  | { type: "history.changed" }
  | { type: "week.changed"; weekStart: string }
  | { type: "progress.changed"; slug: string; progress: CookingProgress };

/** What's been done so far while cooking a recipe. */
export type CookingProgress = { steps: number[]; ingredients: string[] };

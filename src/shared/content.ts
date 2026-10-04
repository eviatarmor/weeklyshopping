import { z } from "zod";

export const catalogEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  section: z.string(),
  imageUrl: z.url().optional(),
});
export const catalogSchema = z.array(catalogEntrySchema);
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive().optional(),
  unit: z.string().optional(),
  /** Catalog product slug. */
  product: z.string().optional(),
  /** Blend recipe slug (a seasoning that is itself a recipe). */
  blend: z.string().optional(),
  optional: z.boolean().optional(),
  /** A staple the recipe assumes you already have (olive oil, salt, ...). */
  pantry: z.boolean().optional(),
  imageUrl: z.url().optional(),
});

export const recipeStepSchema = z.object({
  text: z.string().min(1),
  imageUrl: z.url().optional(),
});

export const recipeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["meal", "blend"]),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  sourceUrl: z.url().optional(),
  imageUrl: z.url().optional(),
  /** Meals: number of people. Blends: how many `yieldUnit`s one batch makes. */
  servings: z.number().positive(),
  yieldUnit: z.string().optional(),
  prepMinutes: z.number().int().positive().optional(),
  /** Per serving, as published by the source (estimates). */
  nutrition: z
    .object({
      kcal: z.number().nonnegative(),
      proteinG: z.number().nonnegative().optional(),
      carbsG: z.number().nonnegative().optional(),
      fatG: z.number().nonnegative().optional(),
      /** True when we worked it out from the ingredients because the source didn't publish it. */
      estimated: z.boolean().optional(),
    })
    .optional(),
  tags: z.array(z.string()).default([]),
  /** Other names this recipe is known by (used to link blends during import). */
  aliases: z.array(z.string()).default([]),
  addedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ingredients: z.array(recipeIngredientSchema).min(1),
  steps: z.array(recipeStepSchema).default([]),
});
export type RecipeContent = z.infer<typeof recipeSchema>;

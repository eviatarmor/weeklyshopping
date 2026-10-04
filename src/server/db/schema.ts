import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull().default(now),
});

export const sections = sqliteTable("sections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

/**
 * Legacy: the catalog and recipe tables below are no longer written or read.
 * Content is served from memory (see content-store.ts) so deploys don't spend
 * Durable Object row writes. Kept so existing databases stay consistent.
 */
/** Known grocery catalog (legacy, unused). */
export const products = sqliteTable("products", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  sectionId: text("section_id").notNull(),
  imageUrl: text("image_url"),
});

/** What this household has added before: drives autocomplete, section overrides and pantry staples. */
export const itemHistory = sqliteTable("item_history", {
  normalizedName: text("normalized_name").primaryKey(),
  displayName: text("display_name").notNull(),
  productSlug: text("product_slug"),
  sectionId: text("section_id").notNull(),
  /** True when someone moved this item to a different section by hand. */
  sectionOverride: integer("section_override", { mode: "boolean" }).notNull().default(false),
  useCount: integer("use_count").notNull().default(0),
  lastUsedAt: integer("last_used_at").notNull().default(now),
  usuallyHave: integer("usually_have", { mode: "boolean" }).notNull().default(false),
});

export const listItems = sqliteTable(
  "list_items",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    qty: real("qty"),
    unit: text("unit"),
    sectionId: text("section_id").notNull(),
    productSlug: text("product_slug"),
    imageUrl: text("image_url"),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    sourceRecipeSlug: text("source_recipe_slug"),
    addedBy: text("added_by").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("list_items_normalized_idx").on(t.normalizedName)],
);

export const recipes = sqliteTable("recipes", {
  slug: text("slug").primaryKey(),
  kind: text("kind", { enum: ["meal", "blend"] }).notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  servings: real("servings").notNull(),
  yieldUnit: text("yield_unit"),
  prepMinutes: integer("prep_minutes"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  steps: text("steps", { mode: "json" }).$type<{ text: string; imageUrl?: string }[]>().notNull().default(sql`'[]'`),
  addedAt: text("added_at").notNull(),
  /** Hash of the source JSON, so content sync only rewrites recipes that changed. */
  contentHash: text("content_hash").notNull().default(""),
});

export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    recipeSlug: text("recipe_slug").notNull(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    qty: real("qty"),
    unit: text("unit"),
    productSlug: text("product_slug"),
    blendSlug: text("blend_slug"),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
    /** Pantry staple the recipe assumes you have (e.g. olive oil, salt). */
    pantry: integer("pantry", { mode: "boolean" }).notNull().default(false),
    imageUrl: text("image_url"),
  },
  (t) => [primaryKey({ columns: [t.recipeSlug, t.position] })],
);

export const recipeRatings = sqliteTable(
  "recipe_ratings",
  {
    recipeSlug: text("recipe_slug").notNull(),
    userEmail: text("user_email").notNull(),
    stars: integer("stars").notNull(),
    note: text("note"),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.recipeSlug, t.userEmail] })],
);

export const recipeCooked = sqliteTable(
  "recipe_cooked",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeSlug: text("recipe_slug").notNull(),
    userEmail: text("user_email").notNull(),
    cookedAt: integer("cooked_at").notNull().default(now),
  },
  (t) => [index("recipe_cooked_slug_idx").on(t.recipeSlug)],
);

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Dinners planned for a week. A meal is either a recipe or just a name the household typed. */
export const mealPlan = sqliteTable(
  "meal_plan",
  {
    id: text("id").primaryKey(),
    /** Monday of the week, YYYY-MM-DD. */
    weekStart: text("week_start").notNull(),
    /** 0 = Monday … 6 = Sunday; null = "sometime this week". */
    day: integer("day"),
    position: integer("position").notNull().default(0),
    recipeSlug: text("recipe_slug"),
    customName: text("custom_name"),
    servings: integer("servings").notNull().default(2),
    /** Set once this meal's ingredients were added to the shopping list. */
    onListAt: integer("on_list_at"),
    cookedAt: integer("cooked_at"),
    addedBy: text("added_by").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("meal_plan_week_idx").on(t.weekStart)],
);

/** Method steps and ingredients ticked off while cooking, shared by the household. */
export const recipeProgress = sqliteTable("recipe_progress", {
  recipeSlug: text("recipe_slug").primaryKey(),
  doneSteps: text("done_steps", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
  /** Ingredients already added, by position ("3", or "3/1" for a spice inside the blend at position 3). */
  doneIngredients: text("done_ingredients", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  updatedAt: integer("updated_at").notNull().default(now),
});

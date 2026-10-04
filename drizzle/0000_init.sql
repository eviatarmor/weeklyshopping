CREATE TABLE `item_history` (
	`normalized_name` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`product_slug` text,
	`section_id` text NOT NULL,
	`section_override` integer DEFAULT false NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`usually_have` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`qty` real,
	`unit` text,
	`section_id` text NOT NULL,
	`product_slug` text,
	`image_url` text,
	`checked` integer DEFAULT false NOT NULL,
	`note` text,
	`source_recipe_slug` text,
	`added_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `list_items_normalized_idx` ON `list_items` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`section_id` text NOT NULL,
	`image_url` text
);
--> statement-breakpoint
CREATE TABLE `recipe_cooked` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_slug` text NOT NULL,
	`user_email` text NOT NULL,
	`cooked_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_cooked_slug_idx` ON `recipe_cooked` (`recipe_slug`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`recipe_slug` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`qty` real,
	`unit` text,
	`product_slug` text,
	`blend_slug` text,
	`optional` integer DEFAULT false NOT NULL,
	`pantry` integer DEFAULT false NOT NULL,
	`image_url` text,
	PRIMARY KEY(`recipe_slug`, `position`)
);
--> statement-breakpoint
CREATE TABLE `recipe_ratings` (
	`recipe_slug` text NOT NULL,
	`user_email` text NOT NULL,
	`stars` integer NOT NULL,
	`note` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`recipe_slug`, `user_email`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`slug` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text,
	`image_url` text,
	`source_url` text,
	`servings` real NOT NULL,
	`yield_unit` text,
	`prep_minutes` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);

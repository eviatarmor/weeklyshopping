CREATE TABLE `kitchen_items` (
	`normalized_name` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`added_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_notes` (
	`recipe_slug` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `regular_items` (
	`normalized_name` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`qty` real,
	`unit` text,
	`section_id` text,
	`product_slug` text,
	`last_added_week` text
);

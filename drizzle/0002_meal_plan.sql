CREATE TABLE `meal_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`day` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`recipe_slug` text,
	`custom_name` text,
	`servings` integer DEFAULT 2 NOT NULL,
	`on_list_at` integer,
	`cooked_at` integer,
	`added_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_plan_week_idx` ON `meal_plan` (`week_start`);--> statement-breakpoint
CREATE TABLE `recipe_progress` (
	`recipe_slug` text PRIMARY KEY NOT NULL,
	`done_steps` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);

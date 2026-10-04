CREATE TABLE `price_cache` (
	`term` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_vegetarian` (
	`key` text PRIMARY KEY NOT NULL,
	`vegetarian` integer NOT NULL,
	`checked_at` integer NOT NULL
);

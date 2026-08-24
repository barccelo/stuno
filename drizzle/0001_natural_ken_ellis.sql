CREATE TABLE `category_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`easy` text NOT NULL,
	`medium` text NOT NULL,
	`expert` text NOT NULL,
	`sort_order` integer NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `effect_ratings` (
	`effect_id` text NOT NULL,
	`voter` text NOT NULL,
	`score` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`effect_id`, `voter`)
);

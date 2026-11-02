CREATE TABLE `gallery_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` integer NOT NULL,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gallery_uploads_owner_active` ON `gallery_uploads` (`owner`,`active`);--> statement-breakpoint
CREATE INDEX `gallery_uploads_owner_created` ON `gallery_uploads` (`owner`,`created`);
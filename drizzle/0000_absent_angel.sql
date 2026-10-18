CREATE TABLE `clan_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clan_rooms_status_updated` ON `clan_rooms` (`status`,`updated`);
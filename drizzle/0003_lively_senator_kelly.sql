CREATE TABLE `clan_account_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clan_account_challenges_expires` ON `clan_account_challenges` (`expires`);--> statement-breakpoint
CREATE TABLE `clan_account_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`wave` integer DEFAULT 0 NOT NULL,
	`kills` integer DEFAULT 0 NOT NULL,
	`castle` integer DEFAULT 0 NOT NULL,
	`miners` integer DEFAULT 0 NOT NULL,
	`wood` integer DEFAULT 0 NOT NULL,
	`tower` integer DEFAULT 0 NOT NULL,
	`crystals` integer DEFAULT 0 NOT NULL,
	`research` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clan_account_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clan_account_sessions_account` ON `clan_account_sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `clan_account_sessions_expires` ON `clan_account_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `clan_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` integer DEFAULT 0 NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`legacy` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);

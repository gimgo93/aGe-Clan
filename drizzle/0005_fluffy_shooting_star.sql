CREATE TABLE `clan_analytics_actions` (
	`hour` integer NOT NULL,
	`visitor_hash` text NOT NULL,
	`session_hash` text NOT NULL,
	`country` text NOT NULL,
	`action` text NOT NULL,
	PRIMARY KEY(`hour`, `visitor_hash`, `session_hash`, `action`, `country`)
);
--> statement-breakpoint
CREATE INDEX `clan_analytics_actions_hour` ON `clan_analytics_actions` (`hour`);--> statement-breakpoint
CREATE INDEX `clan_analytics_actions_action_hour` ON `clan_analytics_actions` (`action`,`hour`);--> statement-breakpoint
CREATE TABLE `clan_analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_hash` text NOT NULL,
	`session_hash` text NOT NULL,
	`event` text NOT NULL,
	`source` text NOT NULL,
	`country` text NOT NULL,
	`success` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clan_analytics_events_created` ON `clan_analytics_events` (`created`);--> statement-breakpoint
CREATE INDEX `clan_analytics_events_event_created` ON `clan_analytics_events` (`event`,`created`);--> statement-breakpoint
CREATE INDEX `clan_analytics_events_visitor_created` ON `clan_analytics_events` (`visitor_hash`,`created`);--> statement-breakpoint
CREATE TABLE `clan_analytics_requests` (
	`hour` integer NOT NULL,
	`country` text NOT NULL,
	`route` text NOT NULL,
	`status` integer NOT NULL,
	`bot` integer NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`total_ms` integer DEFAULT 0 NOT NULL,
	`max_ms` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`hour`, `country`, `route`, `status`, `bot`)
);
--> statement-breakpoint
CREATE INDEX `clan_analytics_requests_hour` ON `clan_analytics_requests` (`hour`);
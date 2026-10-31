import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('clan_rooms', {
 id: text('id').primaryKey(), status: text('status').notNull(), state: text('state').notNull(),
 version: integer('version').notNull().default(0), updated: integer('updated').notNull(),
}, t => [index('clan_rooms_status_updated').on(t.status,t.updated)]);
export const feedback = sqliteTable('clan_feedback', {
 id: text('id').primaryKey(), message: text('message').notNull(), created: integer('created').notNull(),
});
export const rankings = sqliteTable('clan_rankings', {
 accountId: text('account_id'),
 id: text('id').primaryKey(), name: text('name').notNull(), avatar: integer('avatar').notNull().default(0),
 wave: integer('wave').notNull(), updated: integer('updated').notNull(),
}, t => [index('clan_rankings_wave').on(t.wave)]);
export const limits = sqliteTable('clan_limits', {
 id: text('id').primaryKey(), hits: integer('hits').notNull(), expires: integer('expires').notNull(),
}, t => [index('clan_limits_expires').on(t.expires)]);
export const accounts=sqliteTable('clan_accounts',{
 id:text('id').primaryKey(),name:text('name').notNull(),avatar:integer('avatar').notNull().default(0),
 settings:text('settings').notNull().default('{}'),legacy:text('legacy').notNull().default('{}'),revision:integer('revision').notNull().default(1),created:integer('created').notNull(),updated:integer('updated').notNull(),
});
export const accountSessions=sqliteTable('clan_account_sessions',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull(),expires:integer('expires').notNull(),
},t=>[index('clan_account_sessions_account').on(t.accountId),index('clan_account_sessions_expires').on(t.expires)]);
export const accountChallenges=sqliteTable('clan_account_challenges',{
 id:text('id').primaryKey(),nonce:text('nonce').notNull(),expires:integer('expires').notNull(),
},t=>[index('clan_account_challenges_expires').on(t.expires)]);
export const accountProgress=sqliteTable('clan_account_progress',{
 id:text('id').primaryKey(),wave:integer('wave').notNull().default(0),kills:integer('kills').notNull().default(0),castle:integer('castle').notNull().default(0),miners:integer('miners').notNull().default(0),wood:integer('wood').notNull().default(0),tower:integer('tower').notNull().default(0),crystals:integer('crystals').notNull().default(0),research:integer('research').notNull().default(0),updated:integer('updated').notNull(),
});
export const analyticsEvents=sqliteTable('clan_analytics_events',{
 id:text('id').primaryKey(),visitorHash:text('visitor_hash').notNull(),sessionHash:text('session_hash').notNull(),event:text('event').notNull(),source:text('source').notNull(),country:text('country').notNull(),success:integer('success').notNull(),created:integer('created').notNull(),
},t=>[index('clan_analytics_events_created').on(t.created),index('clan_analytics_events_event_created').on(t.event,t.created),index('clan_analytics_events_visitor_created').on(t.visitorHash,t.created)]);
export const analyticsRequests=sqliteTable('clan_analytics_requests',{
 hour:integer('hour').notNull(),country:text('country').notNull(),route:text('route').notNull(),status:integer('status').notNull(),bot:integer('bot').notNull(),requests:integer('requests').notNull().default(0),totalMs:integer('total_ms').notNull().default(0),maxMs:integer('max_ms').notNull().default(0),
},t=>[primaryKey({columns:[t.hour,t.country,t.route,t.status,t.bot]}),index('clan_analytics_requests_hour').on(t.hour)]);
export const analyticsActions=sqliteTable('clan_analytics_actions',{
 hour:integer('hour').notNull(),visitorHash:text('visitor_hash').notNull(),sessionHash:text('session_hash').notNull(),country:text('country').notNull(),action:text('action').notNull(),
},t=>[primaryKey({columns:[t.hour,t.visitorHash,t.sessionHash,t.action,t.country]}),index('clan_analytics_actions_hour').on(t.hour),index('clan_analytics_actions_action_hour').on(t.action,t.hour)]);

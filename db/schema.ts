import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('clan_rooms', {
 id: text('id').primaryKey(), status: text('status').notNull(), state: text('state').notNull(),
 version: integer('version').notNull().default(0), updated: integer('updated').notNull(),
}, t => [index('clan_rooms_status_updated').on(t.status,t.updated)]);
export const feedback = sqliteTable('clan_feedback', {
 id: text('id').primaryKey(), message: text('message').notNull(), created: integer('created').notNull(),
});
export const rankings = sqliteTable('clan_rankings', {
 id: text('id').primaryKey(), name: text('name').notNull(), avatar: integer('avatar').notNull().default(0),
 wave: integer('wave').notNull(), updated: integer('updated').notNull(),
}, t => [index('clan_rankings_wave').on(t.wave)]);
export const limits = sqliteTable('clan_limits', {
 id: text('id').primaryKey(), hits: integer('hits').notNull(), expires: integer('expires').notNull(),
}, t => [index('clan_limits_expires').on(t.expires)]);

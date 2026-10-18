import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('clan_rooms', {
 id: text('id').primaryKey(), status: text('status').notNull(), state: text('state').notNull(),
 version: integer('version').notNull().default(0), updated: integer('updated').notNull(),
}, t => [index('clan_rooms_status_updated').on(t.status,t.updated)]);
export const feedback = sqliteTable('clan_feedback', {
 id: text('id').primaryKey(), message: text('message').notNull(), created: integer('created').notNull(),
});

import { index, integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';

// Persistent reservations double as an audit of recent upload attempts.
export const galleryUploads = sqliteTable('gallery_uploads', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  created: integer('created').notNull(),
  active: integer('active').notNull(),
}, table => [
  index('gallery_uploads_owner_active').on(table.owner, table.active),
  index('gallery_uploads_owner_created').on(table.owner, table.created),
]);

// One durable vote per signed-in account and effect; identifiers are site-scoped hashes.
export const effectRatings = sqliteTable('effect_ratings', {
  effectId: text('effect_id').notNull(),
  voter: text('voter').notNull(),
  // SQLite's INTEGER affinity retains exact half-point REAL values as well as legacy integers.
  score: integer('score').notNull(),
  updated: integer('updated').notNull(),
}, table => [
  primaryKey({columns: [table.effectId, table.voter]}),
]);


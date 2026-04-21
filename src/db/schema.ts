import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const links = pgTable('links', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortCode: text('short_code').notNull().unique(),
  originalUrl: text('original_url').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const visits = pgTable('visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: uuid('link_id').notNull().references(() => links.id),
  ip: text('ip'),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  country: text('country'),
  visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
});

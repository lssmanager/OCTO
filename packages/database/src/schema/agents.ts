import { pgTable, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const agentLevelEnum = pgEnum('agent_level', [
  'agency',
  'department',
  'workspace',
  'agent',
  'subagent',
]);

export const agentsTable = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  level: agentLevelEnum('level').notNull(),
  parentId: text('parent_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

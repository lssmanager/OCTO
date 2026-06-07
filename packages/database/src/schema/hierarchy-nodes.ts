import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  pgEnum,
  uniqueIndex,
  foreignKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const hierarchyLevelEnum = pgEnum('hierarchy_level', [
  'agency',
  'department',
  'workspace',
  'agent',
  'subagent',
]);

export const hierarchyActivationStateEnum = pgEnum('hierarchy_activation_state', [
  'active',
  'inactive',
  'suspended',
  'archived',
]);

export const hierarchyNodes = pgTable(
  'hierarchy_nodes',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('legacy'),
    level: hierarchyLevelEnum('level').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    parentId: text('parent_id').references((): AnyPgColumn => hierarchyNodes.id),
    activationState: hierarchyActivationStateEnum('activation_state').notNull().default('active'),
    modelPolicy: jsonb('model_policy').notNull().default({}),
    toolPolicy: jsonb('tool_policy').notNull().default({}),
    budgetPolicy: jsonb('budget_policy').notNull().default({}),
    governance: jsonb('governance').notNull().default({}),
    capabilities: jsonb('capabilities').notNull().default([]),
    coreFiles: jsonb('core_files').notNull().default([]),
    memoryPolicy: jsonb('memory_policy').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantLevelIdx: index('idx_hierarchy_nodes_tenant_level').on(t.tenantId, t.level),
    parentIdx: index('idx_hierarchy_nodes_parent').on(t.parentId),
    activationIdx: index('idx_hierarchy_nodes_activation_state').on(t.activationState),
    tenantParentSlugUnique: uniqueIndex('hierarchy_nodes_tenant_parent_slug_unique').on(
      t.tenantId,
      t.parentId,
      t.slug
    ),
    tenantIdIdUnique: uniqueIndex('hierarchy_nodes_tenant_id_id_unique').on(t.tenantId, t.id),
    parentTenantFk: foreignKey({
      name: 'hierarchy_nodes_parent_tenant_fk',
      columns: [t.tenantId, t.parentId],
      foreignColumns: [t.tenantId, t.id],
    }),
  })
);

export type HierarchyNode = typeof hierarchyNodes.$inferSelect;
export type NewHierarchyNode = typeof hierarchyNodes.$inferInsert;

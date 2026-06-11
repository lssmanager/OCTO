import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(__dirname, '..', 'migrations');
const runtimeWriteContractPath = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'f1',
  'runtime-write-contract.json'
);

const tenantScopedTables = [
  'agents',
  'agent_versions',
  'executions',
  'execution_steps',
  'execution_checkpoints',
  'execution_checkpoint_writes',
  'tool_invocations',
  'approvals',
  'outbox_events',
  'execution_events',
  'execution_dlq',
  'idempotency_keys',
  'outbox_publish_dlq',
  'hierarchy_nodes',
];

function readRuntimeWriteContract(): {
  runtimeRole: string;
  allowedWriteTables: string[];
  runtimeProhibitedWrites: string[];
  forbiddenRoleAttributes: string[];
} {
  return JSON.parse(readFileSync(runtimeWriteContractPath, 'utf8')) as {
    runtimeRole: string;
    allowedWriteTables: string[];
    runtimeProhibitedWrites: string[];
    forbiddenRoleAttributes: string[];
  };
}

function readMigration(name: string): string {
  const path = join(migrationsDir, name);
  expect(existsSync(path), `${name} should exist`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('F1 database migrations contract', () => {
  it('registers every SQL migration in the Drizzle journal', () => {
    const journal = JSON.parse(readMigration('meta/_journal.json')) as {
      entries: { tag: string }[];
    };
    const registered = new Set(journal.entries.map((entry) => entry.tag));
    const sqlMigrations = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.replace(/\.sql$/, ''));

    for (const migration of sqlMigrations) {
      expect(
        registered.has(migration),
        `${migration} should be registered in meta/_journal.json`
      ).toBe(true);
    }
  });

  it('adds durable execution and checkpoint tables with CAS and stale lease support', () => {
    const sql = readMigration('202605230001_f1_executions_core.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "executions"');
    expect(sql).toContain('"version" INT NOT NULL DEFAULT 0');
    expect(sql).toContain('"tenant_id" TEXT NOT NULL');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "execution_steps"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "execution_checkpoints"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "execution_checkpoint_writes"');
    expect(sql).toContain('idx_executions_tenant_state_created');
    expect(sql).toContain('idx_executions_lease_stale');
    expect(sql).toContain("WHERE state IN ('RUNNING', 'RECLAIMING', 'DISPATCHED')");
    const canonicalSql = readMigration('202605280001_canonical_execution_status.sql');
    expect(canonicalSql).toContain('UPDATE "executions" SET "state" = "status"::text');
    expect(canonicalSql).toContain("WHERE status IN ('running', 'reclaimable', 'dispatched')");
    expect(sql).toContain('idx_checkpoints_execution_step_index');
    expect(sql).toContain('idx_checkpoints_execution_step_unique');
  });

  it('adds tool, approval, outbox, and agent version tables with required indexes', () => {
    const sql = readMigration('202605230002_f1_tools_approvals_outbox.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "agent_versions"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "tool_invocations"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_tool_invocations_idempotency"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "approvals"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "outbox_events"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_outbox_unpublished"');
    expect(sql).toContain('WHERE published_at IS NULL');
  });

  it('enables forced tenant RLS policies for every F1 tenant-scoped table', () => {
    const sql = readMigration('202605230003_f1_rls_policies.sql');
    const tables = [
      'agents',
      'agent_versions',
      'executions',
      'execution_steps',
      'execution_checkpoints',
      'execution_checkpoint_writes',
      'tool_invocations',
      'approvals',
      'outbox_events',
    ];

    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`tenant_isolation_${table}`);
    }

    expect(sql).toContain("tenant_id = current_setting('app.current_tenant', true)");
    expect(sql).not.toMatch(/ALTER\s+ROLE\s+.*BYPASSRLS/i);
    expect(sql).not.toMatch(/\b(GRANT|ALTER)\s+.*BYPASSRLS\b/i);
  });

  it('hardens tenant policies with non-empty tenant guard for all F1 tables', () => {
    const sql = readMigration('202605230004_f1_rls_hardening.sql');
    const tables = [
      'agents',
      'agent_versions',
      'executions',
      'execution_steps',
      'execution_checkpoints',
      'execution_checkpoint_writes',
      'tool_invocations',
      'approvals',
      'outbox_events',
    ];

    for (const table of tables) {
      expect(sql).toContain(`tenant_isolation_${table}`);
    }

    expect(sql).toContain("COALESCE(current_setting(''app.current_tenant'', true), '''') <> ''");
    expect(sql).toContain("tenant_id = current_setting(''app.current_tenant'', true)");
    expect(sql).not.toMatch(/ALTER\s+ROLE\s+.*BYPASSRLS/i);
    expect(sql).not.toMatch(/\b(GRANT|ALTER)\s+.*BYPASSRLS\b/i);
  });

  it('protects hierarchy nodes with the official F1 RLS pattern', () => {
    const sql = readMigration('202605290001_f2_hierarchy_nodes.sql');

    expect(sql).toContain('ALTER TABLE "hierarchy_nodes" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "hierarchy_nodes" FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('tenant_isolation_hierarchy_nodes');
    expect(sql).toContain("tenant_id = current_setting('app.current_tenant', true)");
    expect(sql).toContain("COALESCE(current_setting('app.current_tenant', true), '') <> ''");
    expect(sql).toContain('"hierarchy_nodes_parent_tenant_fk"');
    expect(sql).toContain('"agents_hierarchy_node_tenant_fk"');
  });

  it('hardens tenant-scoped FKs with composite tenant references', () => {
    const sql = readMigration('202606070002_tenant_scoped_integrity_hardening.sql');
    const expectedConstraints = [
      'agents_parent_tenant_fk',
      'agents_hierarchy_node_tenant_fk',
      'agent_versions_agent_tenant_fk',
      'executions_agent_tenant_fk',
      'executions_agent_version_tenant_fk',
      'execution_steps_execution_tenant_fk',
      'execution_checkpoints_execution_tenant_fk',
      'execution_checkpoints_parent_tenant_fk',
      'execution_checkpoint_writes_checkpoint_tenant_fk',
      'approvals_execution_tenant_fk',
      'approvals_step_tenant_fk',
      'tool_invocations_execution_tenant_fk',
      'tool_invocations_step_tenant_fk',
      'tool_invocations_approval_tenant_fk',
      'execution_events_execution_tenant_fk',
      'execution_dlq_execution_tenant_fk',
      'outbox_publish_dlq_event_tenant_fk',
      'hierarchy_nodes_parent_tenant_fk',
    ];

    for (const table of tenantScopedTables) {
      expect(sql).toContain(`tenant_isolation_${table}`);
      expect(sql).toContain(`('${table}', 'tenant_isolation_${table}')`);
    }
    for (const constraint of expectedConstraints) {
      expect(sql).toContain(`"${constraint}"`);
    }
    expect(sql).toContain('outbox_events_tenant_id_id_unique');
    expect(sql).toContain('outbox_publish_dlq_tenant_id_id_unique');
    expect(sql).toContain('NOT VALID');
    expect(sql).toContain("conrelid = 'public.outbox_publish_dlq'::regclass");
  });

  it('keeps outbox publisher hardening checks idempotent per table', () => {
    const sql = readMigration('202605240001_f1_outbox_publisher_hardening.sql');

    expect(sql).toContain("conrelid = 'public.outbox_events'::regclass");
    expect(sql).toContain("conrelid = 'public.outbox_publish_dlq'::regclass");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "outbox_publish_dlq"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_outbox_publish_dlq_tenant_moved_at"');
  });

  it('documents all tenant-scoped RLS tables in security docs', () => {
    const docs = readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'security', 'rls-policies.md'),
      'utf8'
    );
    for (const table of tenantScopedTables) {
      expect(docs).toContain(`- ${table}`);
    }
  });

  it('expands forced tenant RLS to DLQ and idempotency runtime tables', () => {
    const sql = readMigration('202606010001_f1_tenant_isolation_rls_expansion.sql');
    for (const table of ['execution_dlq', 'idempotency_keys']) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`tenant_isolation_${table}`);
    }
    expect(sql).toContain("COALESCE(current_setting('app.current_tenant', true), '') <> ''");
    expect(sql).not.toMatch(/ALTER\s+ROLE\s+.*BYPASSRLS/i);
    expect(sql).not.toMatch(/\b(GRANT|ALTER)\s+.*BYPASSRLS\b/i);
  });

  it('keeps legacy 0004 migration idempotent and non-duplicative', () => {
    const sql = readMigration('0004_shocking_yellow_claw.sql');

    expect(sql).toContain('ALTER TYPE "public"."step_status" ADD VALUE IF NOT EXISTS \'QUEUED\'');
    expect(sql).toContain(
      'ALTER TYPE "public"."tool_invocation_status" ADD VALUE IF NOT EXISTS \'PENDING\''
    );
    expect(sql).toContain(
      'ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS \'dispatched\''
    );
    expect(sql).not.toContain('CREATE TABLE "agent_versions"');
    expect(sql).not.toContain('ALTER TYPE "public"."step_status" ADD VALUE \'QUEUED\';');
  });

  it('restores reclaimed_at before the worker heartbeat migration indexes it', () => {
    const sql = readMigration('202605280002_worker_heartbeats.sql');
    const addColumn =
      'ALTER TABLE "executions"\n  ADD COLUMN IF NOT EXISTS "reclaimed_at" TIMESTAMPTZ;';
    const index = 'CREATE INDEX IF NOT EXISTS idx_executions_tenant_reclaimed';

    expect(sql).toContain(addColumn);
    expect(sql).toContain(index);
    expect(sql.indexOf(addColumn)).toBeLessThan(sql.indexOf(index));
  });

  it('repairs missing approvals without validating historical parent drift', () => {
    const sql = readMigration('202606110001_repair_missing_approvals.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "approvals"');
    expect(sql).toContain(
      'DELETE FROM "approvals"\nWHERE "execution_id" IS NULL\n  OR "step_id" IS NULL;'
    );
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "approvals_tenant_id_id_unique"');
    expect(sql).toContain('"approvals_execution_tenant_fk"');
    expect(sql).toContain('"approvals_step_tenant_fk"');
    expect(sql).toContain('"tool_invocations_approval_tenant_fk"');
    expect(sql).toContain('NOT VALID');
    expect(sql).toContain("c.conrelid = to_regclass('public.approvals')");
    expect(sql).toContain(
      'WHEN duplicate_object OR invalid_foreign_key OR undefined_table OR undefined_column'
    );
    expect(sql).toContain('Skipping approvals_execution_fk repair');
    expect(sql).not.toContain('NOT EXISTS (SELECT 1 FROM "executions"');
    expect(sql).not.toContain('NOT EXISTS (SELECT 1 FROM "execution_steps"');
  });

  it('enforces the F1 runtime worker least-privilege database role', () => {
    const sql = readMigration('202605300002_f1_runtime_db_role.sql');
    const contract = readRuntimeWriteContract();

    expect(sql).toContain(`CREATE ROLE ${contract.runtimeRole}`);
    expect(sql).toContain(`ALTER ROLE ${contract.runtimeRole}`);
    for (const attribute of contract.forbiddenRoleAttributes) {
      expect(sql.toUpperCase()).toContain(`NO${attribute}`);
    }
    expect(sql).toContain(
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${contract.runtimeRole}`
    );
    expect(sql).toContain(
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${contract.runtimeRole}`
    );
    expect(sql).toContain(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${contract.runtimeRole}`);
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE');
    expect(sql).toContain('information_schema.role_table_grants');
    expect(sql).toContain('has_schema_privilege');
    expect(sql).toContain('has_database_privilege');

    for (const table of contract.allowedWriteTables) {
      expect(sql).toMatch(new RegExp(`\\b${table}\\b`));
    }
    for (const table of contract.runtimeProhibitedWrites) {
      expect(sql).not.toMatch(new RegExp(`GRANT\\s+[^;]*\\b${table}\\b`, 'i'));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(__dirname, '..', 'migrations');

function readMigration(name: string): string {
  const path = join(migrationsDir, name);
  expect(existsSync(path), `${name} should exist`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('F1 database migrations contract', () => {
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

  it('keeps legacy 0004 migration idempotent and non-duplicative', () => {
    const sql = readMigration('0004_shocking_yellow_claw.sql');

    expect(sql).toContain("ALTER TYPE \"public\".\"step_status\" ADD VALUE IF NOT EXISTS 'QUEUED'");
    expect(sql).toContain("ALTER TYPE \"public\".\"tool_invocation_status\" ADD VALUE IF NOT EXISTS 'PENDING'");
    expect(sql).toContain("ALTER TYPE \"public\".\"execution_status\" ADD VALUE IF NOT EXISTS 'dispatched'");
    expect(sql).not.toContain('CREATE TABLE "agent_versions"');
    expect(sql).not.toContain("ALTER TYPE \"public\".\"step_status\" ADD VALUE 'QUEUED';");
  });

});

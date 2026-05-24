import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const runIfDatabase = databaseUrl ? describe : describe.skip;
const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, '..', 'migrations');
const migrationFiles = [
  '202605230001_f1_executions_core.sql',
  '202605230002_f1_tools_approvals_outbox.sql',
  '202605230003_f1_rls_policies.sql',
  '202605230004_f1_rls_hardening.sql',
];

type Sql = ReturnType<typeof postgres>;

function readMigrationStatements(file: string): string[] {
  return readFileSync(join(migrationsDir, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

runIfDatabase('F1 database integration', () => {
  const sql = postgres(databaseUrl!, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    onnotice: () => undefined,
  });

  beforeAll(async () => {
    for (const file of migrationFiles) {
      for (const statement of readMigrationStatements(file)) {
        await sql.unsafe(statement);
      }
    }

    for (const tenantId of ['tenant-a', 'tenant-b', 'legacy']) {
      await cleanupTenant(sql, tenantId);
    }
  });

  

  it('enables and forces RLS on all F1 tenant-scoped tables', async () => {
    const tables = [
      'agents','agent_versions','executions','execution_steps','execution_checkpoints',
      'execution_checkpoint_writes','tool_invocations','approvals','outbox_events',
    ];
    const rows = await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${tables})
      ORDER BY c.relname
    `;
    expect(rows).toHaveLength(tables.length);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('creates tenant isolation policies with non-empty tenant guard', async () => {
    const tables = [
      'agents','agent_versions','executions','execution_steps','execution_checkpoints',
      'execution_checkpoint_writes','tool_invocations','approvals','outbox_events',
    ];
    const rows = await sql<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }[]>`
      SELECT tablename, policyname, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY(${tables})
      ORDER BY tablename
    `;
    expect(rows.length).toBeGreaterThanOrEqual(tables.length);
    for (const table of tables) {
      const policy = rows.find((r) => r.tablename === table && r.policyname === `tenant_isolation_${table}`);
      expect(policy).toBeDefined();
      expect(policy?.qual ?? '').toContain("current_setting('app.current_tenant'::text, true)");
      expect(policy?.qual ?? '').toContain('COALESCE');
      expect(policy?.with_check ?? '').toContain('COALESCE');
    }
  });
it('enforces compare-and-swap updates on executions.version', async () => {
    await insertAgentVersion(sql, 'tenant-a', 'f1-test-agent-a', 'f1-test-agent-version-cas');
    await insertExecution(sql, {
      id: 'f1-test-execution-cas',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-cas',
      state: 'QUEUED',
    });

    const [first, second] = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', 'tenant-a', true)`;
      const firstUpdate = await tx<{ id: string }[]>`
        UPDATE "executions"
        SET "version" = "version" + 1
        WHERE "id" = 'f1-test-execution-cas' AND "version" = 0
        RETURNING "id"
      `;
      const secondUpdate = await tx<{ id: string }[]>`
        UPDATE "executions"
        SET "version" = "version" + 1
        WHERE "id" = 'f1-test-execution-cas' AND "version" = 0
        RETURNING "id"
      `;
      return [firstUpdate, secondUpdate] as const;
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('returns only stale leased active executions', async () => {
    await insertAgentVersion(sql, 'tenant-a', 'f1-test-agent-a', 'f1-test-agent-version-lease');
    await insertExecution(sql, {
      id: 'f1-test-execution-running-stale',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-lease',
      state: 'RUNNING',
      lease: 'past',
    });
    await insertExecution(sql, {
      id: 'f1-test-execution-dispatched-fresh',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-lease',
      state: 'DISPATCHED',
      lease: 'future',
    });
    await insertExecution(sql, {
      id: 'f1-test-execution-reclaiming-stale',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-lease',
      state: 'RECLAIMING',
      lease: 'past',
    });
    await insertExecution(sql, {
      id: 'f1-test-execution-succeeded-stale',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-lease',
      state: 'SUCCEEDED',
      lease: 'past',
    });

    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', 'tenant-a', true)`;
      return tx<{ id: string }[]>`
        SELECT "id"
        FROM "executions"
        WHERE "state" IN ('RUNNING', 'RECLAIMING', 'DISPATCHED')
          AND "lease_expires_at" < now()
        ORDER BY "id"
      `;
    });

    expect(rows.map((row) => row.id)).toEqual([
      'f1-test-execution-reclaiming-stale',
      'f1-test-execution-running-stale',
    ]);
  });

  it('enforces tool invocation idempotency per tenant', async () => {
    await insertAgentVersion(sql, 'tenant-a', 'f1-test-agent-a', 'f1-test-agent-version-tool-a');
    await insertAgentVersion(sql, 'tenant-b', 'f1-test-agent-b', 'f1-test-agent-version-tool-b');
    await insertExecution(sql, {
      id: 'f1-test-execution-tool-a',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-tool-a',
      state: 'RUNNING',
    });
    await insertExecution(sql, {
      id: 'f1-test-execution-tool-b',
      tenantId: 'tenant-b',
      agentId: 'f1-test-agent-b',
      agentVersionId: 'f1-test-agent-version-tool-b',
      state: 'RUNNING',
    });
    await insertStep(sql, 'f1-test-step-tool-a', 'tenant-a', 'f1-test-execution-tool-a', 0);
    await insertStep(sql, 'f1-test-step-tool-b', 'tenant-b', 'f1-test-execution-tool-b', 0);

    await insertToolInvocation(
      sql,
      'f1-test-tool-a-1',
      'tenant-a',
      'f1-test-execution-tool-a',
      'f1-test-step-tool-a',
      'idem-key'
    );
    await expect(
      insertToolInvocation(
        sql,
        'f1-test-tool-a-2',
        'tenant-a',
        'f1-test-execution-tool-a',
        'f1-test-step-tool-a',
        'idem-key'
      )
    ).rejects.toThrow();
    await expect(
      insertToolInvocation(
        sql,
        'f1-test-tool-b-1',
        'tenant-b',
        'f1-test-execution-tool-b',
        'f1-test-step-tool-b',
        'idem-key'
      )
    ).resolves.toBeDefined();
  });

  it('supports indexed outbox unpublished scans', async () => {
    const [rows, indexes] = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', 'tenant-a', true)`;
      await tx`
        INSERT INTO "outbox_events"
          ("id", "tenant_id", "aggregate_type", "aggregate_id", "event_type", "sequence", "payload_json", "published_at")
        VALUES
          ('f1-test-outbox-unpublished-1', 'tenant-a', 'execution', 'f1-test-execution-outbox', 'ExecutionStarted', 1, '{}'::jsonb, NULL),
          ('f1-test-outbox-published-1', 'tenant-a', 'execution', 'f1-test-execution-outbox', 'ExecutionSucceeded', 2, '{}'::jsonb, now())
      `;
      const unpublished = await tx<{ id: string }[]>`
        SELECT "id"
        FROM "outbox_events"
        WHERE "published_at" IS NULL
        ORDER BY "created_at"
      `;
      const indexRows = await tx<{ indexname: string }[]>`
        SELECT "indexname"
        FROM "pg_indexes"
        WHERE "tablename" = 'outbox_events'
          AND "indexname" = 'idx_outbox_unpublished'
      `;
      return [unpublished, indexRows] as const;
    });

    expect(rows.map((row) => row.id)).toEqual(['f1-test-outbox-unpublished-1']);
    expect(indexes).toHaveLength(1);
  });

  it('isolates F1 rows with transaction-local tenant context', async () => {
    await insertAgentVersion(sql, 'tenant-a', 'f1-test-agent-a', 'f1-test-agent-version-rls-a');
    await insertAgentVersion(sql, 'tenant-b', 'f1-test-agent-b', 'f1-test-agent-version-rls-b');
    await insertExecution(sql, {
      id: 'f1-test-execution-rls-a',
      tenantId: 'tenant-a',
      agentId: 'f1-test-agent-a',
      agentVersionId: 'f1-test-agent-version-rls-a',
      state: 'QUEUED',
    });
    await insertExecution(sql, {
      id: 'f1-test-execution-rls-b',
      tenantId: 'tenant-b',
      agentId: 'f1-test-agent-b',
      agentVersionId: 'f1-test-agent-version-rls-b',
      state: 'QUEUED',
    });

    const tenantA = await selectExecutionIdsForTenant(sql, 'tenant-a');
    const tenantB = await selectExecutionIdsForTenant(sql, 'tenant-b');
    const noTenant = await sql<
      { id: string }[]
    >`SELECT "id" FROM "executions" WHERE "id" LIKE 'f1-test-execution-rls-%' ORDER BY "id"`;
    const crossTenantById = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', 'tenant-a', true)`;
      return tx<
        { id: string }[]
      >`SELECT "id" FROM "executions" WHERE "id" = 'f1-test-execution-rls-b'`;
    });

    expect(tenantA).toContain('f1-test-execution-rls-a');
    expect(tenantA).not.toContain('f1-test-execution-rls-b');
    expect(tenantB).toContain('f1-test-execution-rls-b');
    expect(tenantB).not.toContain('f1-test-execution-rls-a');
    expect(noTenant).toHaveLength(0);
    expect(crossTenantById).toHaveLength(0);
  });

  

  it('blocks cross-tenant insert with WITH CHECK', async () => {
    await insertAgentVersion(sql, 'tenant-a', 'f1-test-agent-a', 'f1-test-agent-version-cross-insert');

    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant', 'tenant-a', true)`;
        await tx`
          INSERT INTO "executions" (
            "id", "tenant_id", "agent_id", "agent_version_id", "state", "input_json",
            "budget_snapshot_json", "context_snapshot_json", "created_by", "task", "governance", "trace_id", "run_id"
          ) VALUES (
            'f1-test-execution-cross-insert', 'tenant-b', 'f1-test-agent-a', 'f1-test-agent-version-cross-insert', 'QUEUED', '{}'::jsonb,
            '{}'::jsonb, '{}'::jsonb, 'test-user', '{}'::jsonb, '{}'::jsonb, 'trace-x', 'run-x'
          )
        `;
      })
    ).rejects.toThrow();
  });

  it('denies reads and writes when tenant context is empty', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', '', true)`;
      return tx<{ id: string }[]>`SELECT "id" FROM "executions" WHERE "id" LIKE 'f1-test-execution-rls-%'`;
    });
    expect(rows).toHaveLength(0);

    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant', '', true)`;
        await tx`
          INSERT INTO "agents" ("id", "tenant_id", "name", "role", "goal")
          VALUES ('f1-test-agent-empty-tenant', 'tenant-a', 'n', 'worker', 'g')
        `;
      })
    ).rejects.toThrow();
  });
it('does not grant BYPASSRLS to the current database role', async () => {
    const [role] = await sql<{ rolbypassrls: boolean }[]>`
      SELECT "rolbypassrls"
      FROM "pg_roles"
      WHERE "rolname" = current_user
    `;

    expect(role?.rolbypassrls).toBe(false);
  });
});

async function cleanupTenant(sql: Sql, tenantId: string) {
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    await tx`DELETE FROM "tool_invocations" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "approvals" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "outbox_events" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "execution_checkpoint_writes" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "execution_checkpoints" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "execution_steps" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "executions" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "agent_versions" WHERE "id" LIKE 'f1-test-%'`;
    await tx`DELETE FROM "agents" WHERE "id" LIKE 'f1-test-%'`;
  });
}

async function selectExecutionIdsForTenant(sql: Sql, tenantId: string): Promise<string[]> {
  const rows = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return tx<{ id: string }[]>`
      SELECT "id"
      FROM "executions"
      WHERE "id" LIKE 'f1-test-execution-rls-%'
      ORDER BY "id"
    `;
  });
  return rows.map((row) => row.id);
}

async function insertAgentVersion(
  sql: Sql,
  tenantId: string,
  agentId: string,
  agentVersionId: string
) {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    await tx`
      INSERT INTO "agents" ("id", "tenant_id", "name", "role", "goal")
      VALUES (${agentId}, ${tenantId}, ${agentId}, 'worker', 'test')
      ON CONFLICT ("id") DO NOTHING
    `;
    return tx`
      INSERT INTO "agent_versions" ("id", "tenant_id", "agent_id", "version", "config_json")
      VALUES (${agentVersionId}, ${tenantId}, ${agentId}, 1, '{}'::jsonb)
      ON CONFLICT ("id") DO NOTHING
    `;
  });
}

async function insertExecution(
  sql: Sql,
  row: {
    id: string;
    tenantId: string;
    agentId: string;
    agentVersionId: string;
    state: string;
    lease?: 'past' | 'future';
  }
) {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${row.tenantId}, true)`;
    await tx`
      INSERT INTO "executions" (
        "id", "tenant_id", "agent_id", "agent_version_id", "state", "input_json",
        "budget_snapshot_json", "context_snapshot_json", "created_by", "task", "governance", "trace_id", "run_id"
      )
      VALUES (
        ${row.id}, ${row.tenantId}, ${row.agentId}, ${row.agentVersionId}, ${row.state}, '{}'::jsonb,
        '{}'::jsonb, '{}'::jsonb, 'test-user', '{}'::jsonb, '{}'::jsonb, ${row.id}, ${row.id}
      )
    `;
    if (row.lease === 'past') {
      await tx`UPDATE "executions" SET "lease_expires_at" = now() - interval '1 minute' WHERE "id" = ${row.id}`;
    }
    if (row.lease === 'future') {
      await tx`UPDATE "executions" SET "lease_expires_at" = now() + interval '1 minute' WHERE "id" = ${row.id}`;
    }
  });
}

async function insertStep(
  sql: Sql,
  id: string,
  tenantId: string,
  executionId: string,
  stepIndex: number
) {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return tx`
      INSERT INTO "execution_steps" ("id", "tenant_id", "execution_id", "step_index", "step_type", "status")
      VALUES (${id}, ${tenantId}, ${executionId}, ${stepIndex}, 'tool_dispatch', 'RUNNING')
    `;
  });
}

async function insertToolInvocation(
  sql: Sql,
  id: string,
  tenantId: string,
  executionId: string,
  stepId: string,
  idempotencyKey: string
) {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return tx`
      INSERT INTO "tool_invocations" (
        "id", "tenant_id", "execution_id", "step_id", "tool_name", "tool_kind", "status", "args_json", "idempotency_key"
      )
      VALUES (${id}, ${tenantId}, ${executionId}, ${stepId}, 'test.tool', 'builtin', 'RUNNING', '{}'::jsonb, ${idempotencyKey})
    `;
  });
}

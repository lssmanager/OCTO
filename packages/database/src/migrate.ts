// packages/database/src/migrate.ts
// Standalone Drizzle migration runner — owns its deps (drizzle-orm, postgres)
// so pnpm resolves them from packages/database/node_modules at runtime.
//
// Executed by Docker CMD: node packages/database/dist/migrate.js
//
// Exit codes (issue #33 contract):
//   0 = migrations applied successfully
//   1 = DB unreachable after MAX_RETRIES attempts
//   2 = migration script failed (schema error or SQL error)
//
// Never imports NestJS — intentionally standalone to keep startup isolation.
// ADR F0-004 (database layer), F0-014 (Dockerfile strategy)

import { readFileSync } from 'node:fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3_000;

// Migrations folder is at packages/database/migrations — resolved relative
// to this file's compiled location (packages/database/dist/migrate.js).
const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'migrations');
const RUNTIME_TABLE_DRIFT_REPAIR_MIGRATION = '202606110002_repair_missing_f1_runtime_tables';

const F1_RUNTIME_TABLES = [
  'approvals',
  'execution_checkpoint_writes',
  'execution_checkpoints',
  'execution_steps',
  'executions',
  'outbox_events',
  'tool_invocations',
  'worker_heartbeats',
] as const;

const F1_RUNTIME_TABLE_VALUES_SQL = F1_RUNTIME_TABLES.map((table) => `('${table}')`).join(', ');

async function applyRuntimeTableDriftRepair(sql: ReturnType<typeof postgres>): Promise<void> {
  const repairMigrationPath = path.join(
    MIGRATIONS_FOLDER,
    `${RUNTIME_TABLE_DRIFT_REPAIR_MIGRATION}.sql`
  );
  const repairSql = readFileSync(repairMigrationPath, 'utf8');
  const statements = repairSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  log('info', 'runtime_table_drift_repair_start', {
    migration: RUNTIME_TABLE_DRIFT_REPAIR_MIGRATION,
    statements: statements.length,
  });

  for (const statement of statements) {
    await sql.unsafe(statement);
  }

  log('info', 'runtime_table_drift_repair_complete', {
    migration: RUNTIME_TABLE_DRIFT_REPAIR_MIGRATION,
    statements: statements.length,
  });
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${label} must be a PostgreSQL identifier (got ${value})`);
  }
}

async function bootstrapRuntimeRole(sql: ReturnType<typeof postgres>): Promise<void> {
  const runtimeRole = process.env['RUNTIME_POSTGRES_USER'] ?? 'octo_runtime';
  const runtimePassword = process.env['RUNTIME_POSTGRES_PASSWORD'];
  const schemaName = process.env['RUNTIME_POSTGRES_SCHEMA'] ?? 'public';

  if (!runtimePassword) {
    log('warn', 'runtime_role_bootstrap_skipped', {
      reason: 'RUNTIME_POSTGRES_PASSWORD is not set',
      runtimeRole,
    });
    return;
  }

  assertIdentifier(runtimeRole, 'RUNTIME_POSTGRES_USER');
  assertIdentifier(schemaName, 'RUNTIME_POSTGRES_SCHEMA');

  // Drizzle can report migrations_complete on long-lived databases whose journal
  // already contains old F1 migrations even if the actual runtime tables drifted
  // away. Re-apply the additive repair before validating grant preconditions.
  await applyRuntimeTableDriftRepair(sql);

  const missingRuntimeTables = await sql.unsafe<{ table_name: string }[]>(
    `SELECT required.table_name
     FROM (VALUES ${F1_RUNTIME_TABLE_VALUES_SQL}) AS required(table_name)
     WHERE to_regclass(format('%I.%I', $1::text, required.table_name)) IS NULL
     ORDER BY required.table_name`,
    [schemaName]
  );

  if (missingRuntimeTables.length > 0) {
    const missingRuntimeTableNames = missingRuntimeTables
      .map((row) => `${schemaName}.${row.table_name}`)
      .join(', ');

    throw new Error(
      `F1 runtime DB role bootstrap cannot grant privileges because required tables are missing: ${missingRuntimeTableNames}. Run the latest migrations or repair schema drift before starting runtime services.`
    );
  }

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('octo.runtime_role', ${runtimeRole}, true)`;
    await tx`SELECT set_config('octo.runtime_password', ${runtimePassword}, true)`;
    await tx`SELECT set_config('octo.runtime_schema', ${schemaName}, true)`;
    await tx.unsafe(`
DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  runtime_password text := current_setting('octo.runtime_password');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      runtime_role,
      runtime_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      runtime_role,
      runtime_password
    );
  END IF;
END $$`);
    await tx.unsafe(`
DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  schema_name text := current_setting('octo.runtime_schema');
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), runtime_role);
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I', current_database(), runtime_role);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), runtime_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM PUBLIC', schema_name);
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', schema_name, runtime_role);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, runtime_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, runtime_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, runtime_role);
END $$`);
    await tx.unsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE ${F1_RUNTIME_TABLES.map((table) => `"${schemaName}"."${table}"`).join(', ')} TO "${runtimeRole}"`
    );
    await tx.unsafe(`
DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  schema_name text := current_setting('octo.runtime_schema');
  allowed_tables CONSTANT text[] := ARRAY[${F1_RUNTIME_TABLES.map((table) => `'${table}'`).join(', ')}];
  role_record record;
  unexpected_table_grants text;
  unexpected_privileges text;
BEGIN
  SELECT * INTO role_record FROM pg_roles WHERE rolname = runtime_role;
  IF role_record IS NULL OR NOT role_record.rolcanlogin THEN
    RAISE EXCEPTION 'Runtime DB role % must exist with LOGIN', runtime_role;
  END IF;
  IF role_record.rolsuper OR role_record.rolbypassrls OR role_record.rolcreatedb OR role_record.rolcreaterole OR role_record.rolreplication THEN
    RAISE EXCEPTION 'Runtime DB role % has administrative attributes', runtime_role;
  END IF;
  IF has_schema_privilege(runtime_role, schema_name, 'CREATE') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATE on schema %', runtime_role, schema_name;
  END IF;
  IF has_database_privilege(runtime_role, current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATE on database %', runtime_role, current_database();
  END IF;
  IF has_database_privilege(runtime_role, current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have TEMPORARY on database %', runtime_role, current_database();
  END IF;
  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected_table_grants
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role
    AND table_schema = schema_name
    AND NOT (table_name = ANY (allowed_tables));
  IF unexpected_table_grants IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has direct table grants outside F1 contract: %', runtime_role, unexpected_table_grants;
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected_privileges
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role
    AND table_schema = schema_name
    AND table_name = ANY (allowed_tables)
    AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE');
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has direct disallowed privileges on F1 tables: %', runtime_role, unexpected_privileges;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected_table_grants
  FROM (
    SELECT c.relname AS table_name, p.privilege
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
    WHERE n.nspname = schema_name
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND NOT (c.relname = ANY (allowed_tables))
      AND has_table_privilege(runtime_role, format('%I.%I', schema_name, c.relname), p.privilege)
  ) effective_table_privileges;
  IF unexpected_table_grants IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has effective table privileges outside F1 contract: %', runtime_role, unexpected_table_grants;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected_privileges
  FROM (
    SELECT c.relname AS table_name, p.privilege
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
    WHERE n.nspname = schema_name
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relname = ANY (allowed_tables)
      AND has_table_privilege(runtime_role, format('%I.%I', schema_name, c.relname), p.privilege)
  ) effective_disallowed_privileges;
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has effective disallowed privileges on F1 tables: %', runtime_role, unexpected_privileges;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected_privileges
  FROM unnest(allowed_tables) AS allowed(table_name)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS p(privilege)
  WHERE NOT has_table_privilege(runtime_role, format('%I.%I', schema_name, allowed.table_name), p.privilege);
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % is missing required effective F1 table privileges: %', runtime_role, unexpected_privileges;
  END IF;

  WITH public_sequences AS (
    SELECT c.relname AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = schema_name
      AND c.relkind = 'S'
  ), allowed_sequences AS (
    SELECT seq.relname AS sequence_name
    FROM pg_class seq
    JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
    JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
    JOIN pg_class tbl ON tbl.oid = dep.refobjid
    JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
    WHERE seq_ns.nspname = schema_name
      AND tbl_ns.nspname = schema_name
      AND tbl.relname = ANY (allowed_tables)
      AND seq.relkind = 'S'
  )
  SELECT string_agg(sequence_name || ':' || privilege, ', ' ORDER BY sequence_name, privilege)
  INTO unexpected_privileges
  FROM public_sequences
  CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(privilege)
  WHERE NOT EXISTS (
      SELECT 1 FROM allowed_sequences WHERE allowed_sequences.sequence_name = public_sequences.sequence_name
    )
    AND has_sequence_privilege(runtime_role, format('%I.%I', schema_name, public_sequences.sequence_name), p.privilege);
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has effective sequence privileges outside F1 contract: %', runtime_role, unexpected_privileges;
  END IF;
END $$`);
  });

  log('info', 'runtime_role_bootstrap_complete', { runtimeRole, schemaName });
}

// ─── structured JSON log helpers ─────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>): void {
  process.stdout.write(
    JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }) + '\n'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    log('error', 'db_unreachable', {
      reason:
        'DATABASE_URL env var is not set. ' +
        'Set it as a Runtime Environment Variable in Coolify (NOT a Build Variable).',
    });
    process.exit(1);
  }

  log('info', 'migrate_start', {
    maxRetries: MAX_RETRIES,
    retryDelayMs: RETRY_DELAY_MS,
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  // ── Retry loop: wait for Postgres to become reachable ────────────────────
  let sql: ReturnType<typeof postgres> | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      sql = postgres(databaseUrl, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 5,
        onnotice: () => undefined,
      });

      // Probe: send a trivial query to confirm the connection works.
      await sql`SELECT 1`;

      log('info', 'db_connected', { attempt });
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('warn', 'db_connect_retry', { attempt, maxRetries: MAX_RETRIES, error: message });

      if (sql) {
        try {
          await sql.end();
        } catch {
          /* ignore cleanup errors */
        }
        sql = null;
      }

      if (attempt === MAX_RETRIES) {
        log('error', 'db_unreachable', { attempt, error: message });
        process.exit(1);
      }

      await sleep(RETRY_DELAY_MS);
    }
  }

  if (!sql) {
    log('error', 'db_unreachable', { reason: 'sql client not initialized after retry loop' });
    process.exit(1);
  }

  // ── Run migrations ────────────────────────────────────────────────────────
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    log('info', 'migrations_complete', { migrationsFolder: MIGRATIONS_FOLDER });
    await bootstrapRuntimeRole(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', 'migration_failed', { error: message });
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    process.exit(2);
  }

  await sql.end();
}

run().then(() => process.exit(0));

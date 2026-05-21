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

import path from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/migrator';
import postgres from 'postgres';

const MAX_RETRIES    = 10;
const RETRY_DELAY_MS = 3_000;

// Migrations folder is at packages/database/migrations — resolved relative
// to this file's compiled location (packages/database/dist/migrate.js).
const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'migrations');

// ─── structured JSON log helpers ─────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>): void {
  process.stdout.write(
    JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }) + '\n',
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
      reason: 'DATABASE_URL env var is not set. '
        + 'Set it as a Runtime Environment Variable in Coolify (NOT a Build Variable).',
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
        try { await sql.end(); } catch { /* ignore cleanup errors */ }
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', 'migration_failed', { error: message });
    try { await sql.end(); } catch { /* ignore */ }
    process.exit(2);
  }

  await sql.end();
}

run().then(() => process.exit(0));

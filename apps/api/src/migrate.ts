// OCTO API — Standalone migration runner
// Executed by Docker CMD *before* main.js starts.
//
// Contract:
//   - Exits 0 on success
//   - Exits 1 on any failure (missing DATABASE_URL, migration error)
//   - Never imports NestJS bootstrap code — intentionally standalone
//
// ADR F0-004 (database layer), F0-014 (Dockerfile strategy)
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error(
    '[migrate] ✗ DATABASE_URL is not defined. ' +
    'Set it as an Environment Variable in Coolify (NOT a Build Variable). ' +
    'Refusing to start.',
  );
  process.exit(1);
}

const timestamp = new Date().toISOString();

async function runMigrations(): Promise<void> {
  console.log(`[migrate] Starting — ${timestamp}`);

  const sql = postgres(databaseUrl, {
    max: 1, // Single connection for migrations
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: './migrations' });

  console.log(`[migrate] ✓ All migrations applied — ${new Date().toISOString()}`);

  await sql.end();
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[migrate] ✗ Migration failed:', err);
    process.exit(1);
  });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _client: DrizzleDb | undefined;

/**
 * Singleton Drizzle client factory.
 * Connection pool: max 20 in prod, 5 in dev/test (F0-004 contract).
 * ARCHITECTURAL BOUNDARY: runtime-worker MUST NOT import @octo/database.
 * Only the control-plane (apps/api) calls this.
 */
export function getDb(): DrizzleDb {
  if (_client) return _client;

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('[database] DATABASE_URL environment variable is required');
  }

  const isProd = process.env['NODE_ENV'] === 'production';

  const sql = postgres(connectionString, {
    max: isProd ? 20 : 5,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  _client = drizzle(sql, { schema });
  return _client;
}

/** Convenience accessor — same singleton, getter pattern avoids module-load-time side effects */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    return (getDb() as never)[prop];
  },
});

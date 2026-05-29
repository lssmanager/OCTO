import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
export type TenantTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

let _client: DrizzleDb | undefined;

/**
 * Singleton Drizzle client factory.
 * PostgreSQL is the source of truth. Runtime code must set tenant context
 * inside the transaction that performs tenant-scoped business queries.
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

export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    return fn(tx);
  });
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    return (getDb() as never)[prop];
  },
});

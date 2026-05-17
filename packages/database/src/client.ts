import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _client: ReturnType<typeof drizzle> | undefined;

export function getDb(): ReturnType<typeof drizzle> {
  if (_client) return _client;

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const sql = postgres(connectionString);
  _client = drizzle(sql, { schema });
  return _client;
}

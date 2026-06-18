import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import * as schema from './schema';

// Singleton pg.Pool + drizzle wrapper. We attach the pool to the Vercel
// request lifecycle in production so it is cleaned up between invocations
// (avoids stale connections during serverless cold/warm cycles).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Reuse a single pool across module reloads in dev (next-dev HMR).
declare global {
  var __ragAgentPgPool: Pool | undefined;
}

const pool =
  globalThis.__ragAgentPgPool ?? new Pool({ connectionString, max: 10 });
if (process.env.NODE_ENV !== 'production') {
  globalThis.__ragAgentPgPool = pool;
}

attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { schema };
export type DB = typeof db;

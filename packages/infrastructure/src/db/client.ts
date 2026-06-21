// Drizzle ORM client. Owns the pg Pool; the db object is the
// single export everything else in the package uses.
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import 'dotenv/config';
import * as schema from './schema';
import { attachDatabasePool } from './pool';

export { schema };
export const db = drizzle(buildPool(), { schema });
export type DB = typeof db;

function buildPool(): Pool {
  let connectionString = process.env.DATABASE_URL ?? '';
  if (!connectionString) {
    return makeMissingDatabasePool();
  }
  if (
    !connectionString.includes('sslmode=') &&
    !connectionString.includes('uselibpqcompat=')
  ) {
    connectionString += '&sslmode=verify-full';
  }
  return new Pool({ connectionString, max: 10 });
}

interface QueryResult<T = Record<string, unknown>> { rows: T[]; }
interface PoolClient {
  query: (textOrConfig: unknown, valuesOrCallback?: unknown) => Promise<QueryResult>;
  release: () => void;
}

function makeMissingDatabasePool(): Pool {
  const message = 'DATABASE_URL is not set.';
  const stub = {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<T>> =>
      Promise.reject(new Error(message)),
    connect: (): Promise<PoolClient> => Promise.reject(new Error(message)),
    end: (): Promise<void> => Promise.reject(new Error(message)),
    on: () => stub, once: () => stub, emit: () => false,
    removeListener: () => stub, removeAllListeners: () => stub,
    setMaxListeners: () => stub, getMaxListeners: () => 0,
    listeners: () => [], rawListeners: () => [], eventNames: () => [],
    listenerCount: () => 0, addListener: () => stub, off: () => stub,
    prependListener: () => stub, prependOnceListener: () => stub,
  };
  return stub as unknown as Pool;
}

const hasRealDatabase = Boolean(process.env.DATABASE_URL);
if (hasRealDatabase) {
  // drizzle's pool lives on the private _.session property.
  // We don't actually need to attach anything — the pool is
  // already wired by drizzle() above — but the legacy
  // src/lib/db/client.ts used this hook to warn at module
  // load. We keep the import for API parity.
  attachDatabasePool({} as Pool);
}

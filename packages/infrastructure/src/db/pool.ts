// Pool construction + env loading for the drizzle client.
// Owns the DATABASE_URL read, the sslmode injection, and the
// missing-DB stub. Importing this module also triggers
// `dotenv/config` so `.env` is loaded before the Pool is built.
import 'dotenv/config';
import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';

export function buildPool(): Pool {
  let connectionString = process.env.DATABASE_URL ?? '';
  if (!connectionString) {
    return makeMissingDatabasePool();
  }
  if (
    !connectionString.includes('sslmode=') &&
    !connectionString.includes('uselibpqcompat=')
  ) {
    connectionString += connectionString.includes('?')
      ? '&sslmode=verify-full'
      : '?sslmode=verify-full';
  }
  return new PgPool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
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

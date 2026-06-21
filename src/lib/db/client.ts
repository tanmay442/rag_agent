import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import * as schema from './schema';

type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

/**
 * Build the singleton pg.Pool.
 *
 * Two modes:
 *  1. DATABASE_URL is set -> real Pool, attached to Vercel's
 *     request lifecycle so it's cleaned up between serverless
 *     invocations.
 *  2. DATABASE_URL is missing -> a stub Pool whose .query()
 *     throws a clear, actionable error. This lets `next build`
 *     complete (the route-graph walk imports every module) when
 *     the env isn't set, while still surfacing a useful message
 *     at the first real request.
 *
 * Importers use `import { db } from '@/lib/db/client'` exactly as
 * before; the export shape is unchanged.
 */
function buildPool(): Pool {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return makeMissingDatabasePool();
  }
  // Silence the pg v9 deprecation warning about SSL mode aliases.
  // 'prefer', 'require', and 'verify-ca' are currently treated as
  // 'verify-full' by pg-connection-string; normalize to the explicit
  // form so the warning stops and the secure behavior is preserved.
  if (
    !connectionString.includes('sslmode=') &&
    !connectionString.includes('uselibpqcompat=')
  ) {
    connectionString += '&sslmode=verify-full';
  }
  return new Pool({ connectionString, max: 10 });
}

/**
 * Build a stub Pool that defers the "DATABASE_URL is not set"
 * error until first use. We do NOT throw at module load because
 * `next build` imports every module in the route graph and the
 * production build environment doesn't always have DATABASE_URL.
 *
 * The stub returns a never-resolving Promise from .connect()
 * and a rejecting Promise from .query() / .end() so any real
 * usage fails fast and loudly.
 */
function makeMissingDatabasePool(): Pool {
  const message =
    'DATABASE_URL is not set. Add it to .env.local (see .env.example) or set it in your deployment environment.';
  // We need an object that satisfies pg.Pool's structural shape
  // (it has many properties we don't use). `as unknown as Pool`
  // is safe because the only thing reachable in production code
  // is Drizzle's chain, which calls .query() / .connect() on
  // whatever we hand it.
  const stub = {
    query: <T extends QueryResultRow = QueryResultRow>(
      _textOrConfig: unknown,
      _valuesOrCallback?: unknown,
    ): Promise<QueryResult<T>> => {
      return Promise.reject(new Error(message));
    },
    connect: (): Promise<PoolClient> => Promise.reject(new Error(message)),
    end: (): Promise<void> => Promise.reject(new Error(message)),
    on: () => stub,
    once: () => stub,
    emit: () => false,
    removeListener: () => stub,
    removeAllListeners: () => stub,
    setMaxListeners: () => stub,
    getMaxListeners: () => 0,
    listeners: () => [],
    rawListeners: () => [],
    eventNames: () => [],
    listenerCount: () => 0,
    addListener: () => stub,
    off: () => stub,
    prependListener: () => stub,
    prependOnceListener: () => stub,
  };
  return stub as unknown as Pool;
}

function getPool(): Pool {
  return buildPool();
}

const pool = getPool();
const hasRealDatabase = Boolean(process.env.DATABASE_URL);
if (hasRealDatabase) {
  attachDatabasePool(pool);
}

export const db = drizzle(pool, { schema });
export { schema };
export type DB = typeof db;

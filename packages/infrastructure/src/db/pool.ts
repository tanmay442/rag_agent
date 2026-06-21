// Pool-side helpers exposed for the application layer to
// call (e.g. the test setup script). The drizzle client owns
// its own pool; this file only exports a couple of
// attach/detach helpers for ergonomic use.
import type { Pool } from 'pg';

export function attachDatabasePool(pool: Pool): void {
  // The drizzle-managed pool already pools internally; this
  // helper is a no-op kept for backwards compatibility with
  // the existing src/lib/db/client.ts which used it to warn
  // at module load when DATABASE_URL was missing.
  void pool;
}

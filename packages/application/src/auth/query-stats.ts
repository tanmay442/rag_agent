// Use-case: record chat queries and read the top list.
// Source: src/lib/auth/query-stats.ts.
import { ok, type Result } from '@app/domain';
import type { QueryStats } from '../ports/index';

export function recordQuery(
  userId: string,
  query: string,
  deps: { stats: QueryStats },
): Result<void> {
  deps.stats.record(userId, query);
  return ok(undefined);
}

export function getTopQueries(
  limit: number,
  deps: { stats: QueryStats },
): Result<Array<{ q: string; count: number }>> {
  return ok(deps.stats.top(limit));
}

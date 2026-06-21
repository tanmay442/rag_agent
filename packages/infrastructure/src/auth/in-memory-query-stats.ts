// In-process LRU map of (userId -> query -> count). The
// counter resets on cold start and is per-deployment, not
// per-user-end-of-day, so analytics are best-effort.
import type { QueryStats } from '@app/application/ports';

const MAX_USERS = 5_000;
const MAX_QUERIES_PER_USER = 1_000;

interface UserBucket { queries: Map<string, number>; lastTouched: number; }
const users = new Map<string, UserBucket>();

function trimBucket(bucket: UserBucket) {
  if (bucket.queries.size <= MAX_QUERIES_PER_USER) return;
  const entries = Array.from(bucket.queries.entries()).sort((a, b) => a[1] - b[1]);
  const drop = entries.length - MAX_QUERIES_PER_USER;
  for (let i = 0; i < drop; i++) {
    const entry = entries[i];
    if (entry) bucket.queries.delete(entry[0]);
  }
}

function evictIfNeeded() {
  if (users.size <= MAX_USERS) return;
  let oldestKey: string | null = null;
  let oldestTouched = Number.POSITIVE_INFINITY;
  for (const [k, b] of users) {
    if (b.lastTouched < oldestTouched) {
      oldestTouched = b.lastTouched;
      oldestKey = k;
    }
  }
  if (oldestKey) users.delete(oldestKey);
}

export const inMemoryQueryStats: QueryStats = {
  record(userId, query) {
    const text = query.trim().toLowerCase();
    if (!text) return;
    let bucket = users.get(userId);
    if (!bucket) {
      bucket = { queries: new Map(), lastTouched: Date.now() };
      users.set(userId, bucket);
    }
    bucket.lastTouched = Date.now();
    bucket.queries.set(text, (bucket.queries.get(text) ?? 0) + 1);
    trimBucket(bucket);
    evictIfNeeded();
  },
  top(limit) {
    const counts = new Map<string, number>();
    for (const bucket of users.values()) {
      for (const [q, c] of bucket.queries) counts.set(q, (counts.get(q) ?? 0) + c);
    }
    return Array.from(counts.entries())
      .map(([q, count]) => ({ q, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },
};

export function __resetQueryStatsForTests(): void {
  users.clear();
}

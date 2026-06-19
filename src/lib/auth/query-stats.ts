import 'server-only';

// In-process LRU map of (userId -> query -> count). The counter resets on
// cold start and is per-deployment, not per-user-end-of-day, so analytics
// are best-effort. Read by `/api/admin/analytics/summary`.

const MAX_USERS = 5_000;
const MAX_QUERIES_PER_USER = 1_000;

interface UserBucket {
  queries: Map<string, number>;
  lastTouched: number;
}

const users = new Map<string, UserBucket>();

function evictIfNeeded(): void {
  if (users.size <= MAX_USERS) return;
  let oldestKey: string | null = null;
  let oldestTouched = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of users) {
    if (bucket.lastTouched < oldestTouched) {
      oldestTouched = bucket.lastTouched;
      oldestKey = key;
    }
  }
  if (oldestKey) users.delete(oldestKey);
}

function evictUserQueriesIfNeeded(bucket: UserBucket): void {
  if (bucket.queries.size <= MAX_QUERIES_PER_USER) return;
  // Simple: drop the first-inserted entries by converting to an array,
  // sorting by count (lowest first) and trimming. This is approximate
  // but fine for a soft analytics signal.
  const entries = Array.from(bucket.queries.entries());
  entries.sort((a, b) => a[1] - b[1]);
  const toDrop = entries.length - MAX_QUERIES_PER_USER;
  for (let i = 0; i < toDrop; i++) {
    const entry = entries[i];
    if (entry) bucket.queries.delete(entry[0]);
  }
}

export function recordQuery(userId: string, query: string): void {
  const text = query.trim().toLowerCase();
  if (!text) return;
  let bucket = users.get(userId);
  if (!bucket) {
    bucket = { queries: new Map(), lastTouched: Date.now() };
    users.set(userId, bucket);
  }
  bucket.lastTouched = Date.now();
  bucket.queries.set(text, (bucket.queries.get(text) ?? 0) + 1);
  evictUserQueriesIfNeeded(bucket);
  evictIfNeeded();
}

export interface TopQuery {
  q: string;
  count: number;
}

export function getTopQueries(limit = 10): TopQuery[] {
  const counts = new Map<string, number>();
  for (const bucket of users.values()) {
    for (const [q, count] of bucket.queries) {
      counts.set(q, (counts.get(q) ?? 0) + count);
    }
  }
  return Array.from(counts.entries())
    .map(([q, count]) => ({ q, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function __resetQueryStatsForTests(): void {
  users.clear();
}

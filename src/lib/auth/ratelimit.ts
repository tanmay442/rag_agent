import 'server-only';

// Single-instance, in-process LRU rate limiter. Good enough for a
// single Vercel function instance; in production with multiple
// concurrent instances this is a soft cap (the 30/min budget is
// effectively multiplied by the instance count). When we move to a
// distributed deployment, swap this for an Upstash hash and the
// call sites don't change.

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;
const DEFAULT_LIMIT = 30;

export class RateLimitError extends Error {
  status = 429;
  constructor(public readonly retryAfterMs: number) {
    super('Rate limit exceeded');
  }
}

interface Bucket {
  // Recent request timestamps, oldest first.
  timestamps: number[];
  // LRU bookkeeping: every time a bucket is touched we set `lastTouched`.
  // When the cache is full and we need to evict, we drop the bucket with
  // the smallest `lastTouched`.
  lastTouched: number;
}

const buckets = new Map<string, Bucket>();

function evictIfNeeded(): void {
  if (buckets.size <= MAX_KEYS) return;
  let oldestKey: string | null = null;
  let oldestTouched = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of buckets) {
    if (bucket.lastTouched < oldestTouched) {
      oldestTouched = bucket.lastTouched;
      oldestKey = key;
    }
  }
  if (oldestKey) buckets.delete(oldestKey);
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions = {},
): { ok: true; remaining: number; resetMs: number } | { ok: false; retryAfterMs: number } {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const now = Date.now();
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [], lastTouched: now };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  bucket.lastTouched = now;
  evictIfNeeded();
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    return { ok: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }
  bucket.timestamps.push(now);
  const remaining = limit - bucket.timestamps.length;
  const oldest = bucket.timestamps[0] ?? now;
  return { ok: true, remaining, resetMs: oldest + windowMs - now };
}

// Throwing variant. Use at the top of a request handler.
export function enforceRateLimit(
  key: string,
  opts: RateLimitOptions = {},
): void {
  const result = rateLimit(key, opts);
  if (!result.ok) {
    throw new RateLimitError(result.retryAfterMs);
  }
}

// Test-only: drop all buckets. Production code should never call this.
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

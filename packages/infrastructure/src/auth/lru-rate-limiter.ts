// In-process LRU rate limiter. Good enough for a single
// Vercel function instance; in production with multiple
// concurrent instances this is a soft cap. The interface
// matches the application's RateLimiter port.
import type { RateLimiter } from '@app/application/ports';

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;

interface Bucket { timestamps: number[]; lastTouched: number; }
const buckets = new Map<string, Bucket>();

export const lruRateLimiter: RateLimiter = {
  check(key, opts) {
    const now = Date.now();
    const cutoff = now - opts.windowMs;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [], lastTouched: now };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    bucket.lastTouched = now;
    if (buckets.size > MAX_KEYS) {
      let oldestKey: string | null = null;
      let oldestTouched = Number.POSITIVE_INFINITY;
      for (const [k, b] of buckets) {
        if (b.lastTouched < oldestTouched) {
          oldestTouched = b.lastTouched;
          oldestKey = k;
        }
      }
      if (oldestKey) buckets.delete(oldestKey);
    }
    if (bucket.timestamps.length >= opts.limit) {
      const oldest = bucket.timestamps[0] ?? now;
      return { ok: false, retryAfterMs: Math.max(0, oldest + opts.windowMs - now) };
    }
    bucket.timestamps.push(now);
    return {
      ok: true,
      remaining: opts.limit - bucket.timestamps.length,
      resetMs: (bucket.timestamps[0] ?? now) + opts.windowMs - now,
    };
  },
};

export function __resetRateLimitForTests(): void {
  buckets.clear();
}

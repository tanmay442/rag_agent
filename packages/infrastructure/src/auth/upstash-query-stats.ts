// Upstash Redis-backed query stats using a sorted set.
// Falls back to the in-memory adapter when UPSTASH_REDIS_REST_URL is
// unset (see the factory in src/composition.ts).
import { Redis } from '@upstash/redis';
import type { QueryStatsAdapter } from '../adapter-ports';
import { createRedisClient } from './upstash-rate-limiter';

export function createUpstashQueryStats(redis?: Redis): QueryStatsAdapter {
  const client =
    redis ??
    (() => {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) {
        throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.');
      }
      return createRedisClient(url, token);
    })();
  const ZSET_KEY = 'query:global';

  return {
    async record(userId, query) {
      const text = query.trim().toLowerCase();
      if (!text) return;
      await client.zincrby(ZSET_KEY, 1, text);
    },
    async top(limit) {
      const results = await client.zrange<Array<{ member: string; score: number }>>(ZSET_KEY, 0, limit - 1, { rev: true, withScores: true });
      return results.map((r) => ({ q: String(r.member), count: Number(r.score) }));
    },
  };
}

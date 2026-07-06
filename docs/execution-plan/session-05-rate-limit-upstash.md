# Session 05: Rate Limiter + Query Stats → Upstash Redis

## Objective

Replace the in-memory rate limiter (`lru-rate-limiter.ts`) and
in-memory query stats (`in-memory-query-stats.ts`) with Upstash Redis
adapters. The in-memory implementations are per-Vercel-instance, so
with N concurrent instances the rate limit is effectively N× the
intended budget and query stats are fragmented. Upstash Redis is
serverless, REST-based (edge-compatible), and provides a single
source of truth across all instances.

The in-memory adapters are kept as fallbacks for local dev (no
`UPSTASH_REDIS_REST_URL`).

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

No external services needed — without `UPSTASH_REDIS_REST_URL`, the
in-memory adapters are used (acceptable for local single-instance dev).

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-04.md` first. The
QStash async ingest from Session 4 should be complete. Key things to
know:

- The `documents` table now has `ingest_status`.
- The `IngestQueue` port exists.
- The ingest worker route is at `/api/admin/ingest-worker`.

### Files to Read First

- `packages/infrastructure/src/auth/lru-rate-limiter.ts` — current
  in-memory sliding-window rate limiter
- `packages/infrastructure/src/auth/in-memory-query-stats.ts` —
  current in-memory query stats
- `packages/infrastructure/src/auth/index.ts` — exports
- `packages/domain/src/ports.ts` — `RateLimiter` (line 169) and
  `QueryStats` (line 176) ports
- `src/composition.ts` — lines 46, 62-63, 93-94 (rate limit and query
  stats wiring)
- `config/constants.ts` — rate limit constants
  (`CHAT_RATE_LIMIT`)

---

## Implementation

### 1. Add `@upstash/redis` to dependencies

```bash
pnpm add @upstash/redis
```

### 2. Create `packages/infrastructure/src/auth/upstash-rate-limiter.ts`

Implements the `RateLimiter` port using Upstash Redis. Uses a
sliding-window counter with per-window keys.

```typescript
import { Redis } from '@upstash/redis';
import type { RateLimiter } from '@app/domain';

export function createUpstashRateLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.');
  const redis = Redis.fromEnv({ url, token });

  return {
    check(key, opts) {
      // Sliding window: use INCR on a time-bucketed key with EXPIRE
      // For simplicity, use a fixed window approach:
      //   key = `${key}:${Math.floor(Date.now() / opts.windowMs)}`
      //   count = INCR(key)
      //   if count == 1: EXPIRE(key, windowMs/1000)
      //   if count > limit: return { ok: false, retryAfterMs: windowMs }
      //
      // This is a fixed-window counter, not a true sliding window.
      // For a true sliding window, use a sorted set approach.
      // The fixed-window approach is simpler and good enough for
      // rate limiting (worst case: 2× burst at window boundaries).
      //
      // Implementation here:
      // Note: Upstash Redis client is async, but the RateLimiter.check
      // signature is synchronous. You need to either:
      //   a) Change the port to be async, OR
      //   b) Use a "fire and forget" pattern with a cached count
      //
      // RECOMMENDED: Change RateLimiter.check to be async.
      // This is a port change — update the port and all adapters.
    },
  };
}
```

**Important**: The current `RateLimiter.check` signature is
synchronous (`check(key, opts): { ok, ... } | { ok: false, ... }`).
Upstash Redis is async (REST calls). You must change the port to be
async:

### 3. Update `packages/domain/src/ports.ts` — `RateLimiter` port

Change:
```typescript
export interface RateLimiter {
  check(
    key: string,
    opts: { limit: number; windowMs: number },
  ): { ok: true; remaining: number; resetMs: number } | { ok: false; retryAfterMs: number };
}
```
To:
```typescript
export interface RateLimiter {
  check(
    key: string,
    opts: { limit: number; windowMs: number },
  ): Promise<{ ok: true; remaining: number; resetMs: number } | { ok: false; retryAfterMs: number }>;
}
```

### 4. Update all `RateLimiter` consumers to `await`

Search for `.check(` in the codebase and add `await`:
- `packages/infrastructure/src/auth/lru-rate-limiter.ts` — update
  `check` to be async (return `Promise.resolve(...)`)
- `src/composition.ts` — `rateLimit` method (line 93-94) becomes async
- `src/app/api/chat/route.ts` — wherever `enforceRateLimit` or
  `rateLimit.check` is called, add `await`
- `packages/application/src/` — the `enforceRateLimit` use-case
- Any test that mocks `RateLimiter.check` — update to return a Promise

### 5. Implement `upstash-rate-limiter.ts` (async version)

```typescript
import { Redis } from '@upstash/redis';
import type { RateLimiter } from '@app/domain';

export function createUpstashRateLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.');
  const redis = new Redis({ url, token });

  return {
    async check(key, opts) {
      const now = Date.now();
      const windowId = Math.floor(now / opts.windowMs);
      const redisKey = `ratelimit:${key}:${windowId}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, Math.ceil(opts.windowMs / 1000) + 1);
      }
      if (count > opts.limit) {
        const resetMs = (windowId + 1) * opts.windowMs - now;
        return { ok: false, retryAfterMs: Math.max(0, resetMs) };
      }
      return {
        ok: true,
        remaining: opts.limit - count,
        resetMs: (windowId + 1) * opts.windowMs - now,
      };
    },
  };
}
```

### 6. Create `packages/infrastructure/src/auth/upstash-query-stats.ts`

Implements the `QueryStats` port using Upstash Redis sorted sets:

```typescript
import { Redis } from '@upstash/redis';
import type { QueryStats } from '@app/domain';

export function createUpstashQueryStats(): QueryStats {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.');
  const redis = new Redis({ url, token });
  const ZSET_KEY = 'query:global';

  return {
    async record(userId, query) {
      const text = query.trim().toLowerCase();
      if (!text) return;
      await redis.zincrby(ZSET_KEY, 1, text);
    },
    async top(limit) {
      const results = await redis.zrange(ZSET_KEY, 0, limit - 1, { rev: true, withScore: true });
      return results.map((r) => ({ q: String(r.member), count: Number(r.score) }));
    },
  };
}
```

Note: the `QueryStats` port's `record` and `top` methods are currently
synchronous. Change them to be async (same approach as `RateLimiter`).

### 7. Update `packages/domain/src/ports.ts` — `QueryStats` port

Change:
```typescript
export interface QueryStats {
  record(userId: string, query: string): void;
  top(limit: number): Array<{ q: string; count: number }>;
}
```
To:
```typescript
export interface QueryStats {
  record(userId: string, query: string): Promise<void>;
  top(limit: number): Promise<Array<{ q: string; count: number }>>;
}
```

### 8. Update all `QueryStats` consumers to `await`

Search for `.record(` and `.top(` in query-stats contexts and add
`await`:
- `packages/infrastructure/src/auth/in-memory-query-stats.ts` — make
  async
- `src/composition.ts` — `recordQuery` (line 62), `getTopQueries` (line
  63), `getAnalyticsSummary` (line 85-86)
- `src/app/api/chat/route.ts` — wherever `recordQuery` is called
- Any test mocking `QueryStats`

### 9. Update `packages/infrastructure/src/auth/index.ts`

Export the new adapters:
```typescript
export { createUpstashRateLimiter } from './upstash-rate-limiter';
export { createUpstashQueryStats } from './upstash-query-stats';
// Keep existing exports:
export { lruRateLimiter } from './lru-rate-limiter';
export { inMemoryQueryStats } from './in-memory-query-stats';
```

### 10. Update `src/composition.ts` — adapter selection

Add a factory that picks Upstash or in-memory based on env:

```typescript
function createRateLimiter(): RateLimiter {
  if (process.env.UPSTASH_REDIS_REST_URL) return Auth.createUpstashRateLimiter();
  return Auth.lruRateLimiter;
}

function createQueryStats(): QueryStats {
  if (process.env.UPSTASH_REDIS_REST_URL) return Auth.createUpstashQueryStats();
  return Auth.inMemoryQueryStats;
}
```

Use these in `createComposition()` instead of the hard-coded
`Auth.lruRateLimiter` and `Auth.inMemoryQueryStats`.

### 11. Update tests

- Update `RateLimiter` mocks to return `Promise.resolve(...)` instead
  of plain objects.
- Update `QueryStats` mocks similarly.
- Add a test for the Upstash rate limiter (mock `@upstash/redis`):
  - Under-limit request → `{ ok: true, remaining: N-1 }`
  - Over-limit request → `{ ok: false, retryAfterMs: ... }`
- Add a test for the Upstash query stats (mock `@upstash/redis`):
  - `record` → `zincrby` called
  - `top` → returns sorted results

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| `UPSTASH_REDIS_REST_URL` | no | — | If set, Upstash Redis is used for rate limiting + query stats |
| `UPSTASH_REDIS_REST_TOKEN` | no | — | Upstash Redis auth token |

If both are unset, the in-memory adapters are used (acceptable for
local dev / single-instance).

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

New files:
- `packages/infrastructure/src/auth/upstash-rate-limiter.ts`
- `packages/infrastructure/src/auth/upstash-query-stats.ts`

Modified:
- `packages/domain/src/ports.ts` — `RateLimiter.check` and
  `QueryStats.record`/`top` are now async
- `packages/infrastructure/src/auth/lru-rate-limiter.ts` — async
  wrapper
- `packages/infrastructure/src/auth/in-memory-query-stats.ts` — async
  wrapper
- `packages/infrastructure/src/auth/index.ts` — new exports
- `src/composition.ts` — adapter selection factory
- `src/app/api/chat/route.ts` — `await` on rate limit + query stats
- `packages/application/src/` — `await` on rate limit + query stats
  calls
- Various test files — async mocks
- `package.json` — `@upstash/redis` added

---

## Gotchas / Things to Watch Out For

1. **Async port change is breaking**: Changing `RateLimiter.check`
  from sync to async ripples through every caller. Search for all
  `.check(` calls and add `await`. The `enforceRateLimit` use-case in
  `packages/application/src/` is the primary consumer — it returns a
  `Result`, so the async change is transparent to its callers as long
  as the use-case itself is already async (it is — use-cases return
  `Promise<Result<T>>`).

2. **`QueryStats.record` is fire-and-forget currently**: The current
  `inMemoryQueryStats.record` is synchronous and non-blocking. Making
  it async means callers need to `await` it (or fire-and-forget with
  `.catch()`). In the chat route, `recordQuery` should be
  fire-and-forget (don't block the response on analytics). Use
  `void comp.recordQuery(userId, query).catch(() => {})` — same
  pattern as `touchLastSeen` in `session.ts:83`.

3. **`QueryStats.top` is used in `/admin/analytics`**: This is an admin
  page that can afford to `await` the Redis call. No fire-and-forget
  here.

4. **Fixed-window vs sliding-window**: The implementation above uses a
  fixed-window counter. At window boundaries, a client could make up
  to 2× the limit (N at the end of one window, N at the start of the
  next). For a chat rate limiter, this is acceptable. If you want a
  true sliding window, use a Redis sorted set with timestamps as
  scores — but it's more expensive per check. Document the tradeoff.

5. **Upstash Redis client is edge-compatible**: `@upstash/redis` uses
  `fetch` internally, so it works in both Node and Edge runtimes. No
  polyfill needed.

6. **Test mocking**: The Upstash Redis client can be mocked with
  `vi.mock('@upstash/redis', ...)`. Mock the `Redis` class and its
  `incr`, `expire`, `zincrby`, `zrange` methods.

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit — watch for missing await on .check()/.record()/.top()
pnpm lint         # eslint
pnpm test         # vitest run — all tests must pass (async mocks updated)
pnpm arch         # dependency-cruiser
```

After validation, test locally (in-memory fallback, no Upstash):
```bash
pnpm dev
# Hit /api/chat 31 times in 60 seconds → 31st should return 429
# (same behavior as before, just now async)
```

If you have Upstash credentials:
```bash
# Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local
pnpm dev
# Hit /api/chat 31 times → 31st should return 429
# Check Upstash Redis console → see the ratelimit keys
```

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-05): move rate limiter + query stats to Upstash Redis

Add Upstash Redis adapters for RateLimiter and QueryStats ports.
Make port methods async. Fall back to in-memory adapters when
UPSTASH_REDIS_REST_URL is unset (local dev).

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-05.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

Write `docs/execution-plan/context/after-session-05.md`. Include:

1. **The port signature changes**: `RateLimiter.check` and
   `QueryStats.record`/`top` are now async. List every file that was
   updated to add `await`.
2. **The adapter selection logic**: Upstash when
   `UPSTASH_REDIS_REST_URL` is set, in-memory otherwise.
3. **The fixed-window approach**: note that the rate limiter uses a
   fixed-window counter (2× burst possible at boundaries).
4. **Fire-and-forget pattern**: note that `recordQuery` in the chat
   route uses `void ... .catch(() => {})`.
5. **Tell the next agent**: "Rate limiting and query stats now use
   Upstash Redis when `UPSTASH_REDIS_REST_URL` is set, falling back to
   in-memory for local dev. The `RateLimiter.check` and
   `QueryStats.record`/`top` ports are now async. Read
   `packages/infrastructure/src/auth/upstash-rate-limiter.ts` and
   `upstash-query-stats.ts` for the adapters. The composition root
   selects the adapter based on env."

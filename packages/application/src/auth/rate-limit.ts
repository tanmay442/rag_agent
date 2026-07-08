// Use-case: enforce a per-user rate limit on the chat route.
import { Effect } from 'effect';
import { RateLimiter } from '@app/domain';

interface RateLimitInput {
  key: string;
  limit: number;
  windowMs: number;
}

export const enforceRateLimit = Effect.fn('Auth.enforceRateLimit')(
  function* (input: RateLimitInput) {
    const limiter = yield* RateLimiter;
    return yield* limiter.check(input.key, { limit: input.limit, windowMs: input.windowMs });
  },
);

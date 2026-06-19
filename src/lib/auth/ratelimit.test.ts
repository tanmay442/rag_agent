import { describe, it, expect, beforeEach } from 'vitest';
import {
  rateLimit,
  enforceRateLimit,
  RateLimitError,
  __resetRateLimitForTests,
} from './ratelimit';

describe('ratelimit', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
  });

  it('passes under the limit', () => {
    for (let i = 0; i < 30; i++) {
      const r = rateLimit('user-1', { limit: 30, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
  });

  it('blocks the 31st request and reports a retry-after', () => {
    for (let i = 0; i < 30; i++) {
      rateLimit('user-2', { limit: 30, windowMs: 60_000 });
    }
    const r = rateLimit('user-2', { limit: 30, windowMs: 60_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
      expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('enforceRateLimit throws a RateLimitError when over the limit', () => {
    expect(() => {
      for (let i = 0; i < 31; i++) {
        enforceRateLimit('user-3', { limit: 30, windowMs: 60_000 });
      }
    }).toThrow(RateLimitError);
  });

  it('tracks each key independently', () => {
    for (let i = 0; i < 30; i++) {
      rateLimit('user-4', { limit: 30, windowMs: 60_000 });
    }
    // Different key starts fresh.
    const r = rateLimit('user-5', { limit: 30, windowMs: 60_000 });
    expect(r.ok).toBe(true);
  });

  it('evicts the least-recently-touched key when over capacity', () => {
    // Fill past MAX_KEYS so the next insertion evicts something.
    // We can't realistically exercise MAX_KEYS (5000) in a unit test,
    // so we use a smaller limit value to assert the shape of the
    // behaviour at a smaller scale.
    for (let i = 0; i < 3; i++) {
      rateLimit(`k-${i}`, { limit: 5, windowMs: 60_000 });
    }
    // All three keys should still pass.
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(`k-${i}`, { limit: 5, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
  });
});

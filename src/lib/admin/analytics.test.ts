import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db ────────────────────────────────────────────────────────────
// getAnalyticsSummary runs 5 separate db.select({count}).from(table)
// calls. We use a queue: each call pops the next value from `counts`.

const counts: number[] = [];

vi.mock('@/lib/db/client', () => {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        const val = counts.shift() ?? 0;
        return (resolve: (v: unknown) => void) =>
          resolve([{ count: val }]);
      }
      return () => new Proxy({}, handler);
    },
  };
  return {
    db: {
      select: () => new Proxy({}, handler),
    },
  };
});

vi.mock('@/lib/auth/query-stats', () => ({
  getTopQueries: vi.fn().mockReturnValue([
    { q: 'how to login', count: 5 },
    { q: 'billing issue', count: 3 },
  ]),
}));

import { getAnalyticsSummary } from './analytics';

beforeEach(() => {
  counts.length = 0;
});

describe('getAnalyticsSummary', () => {
  it('returns all zero counts when DB is empty', async () => {
    // All 5 queries return 0
    counts.push(0, 0, 0, 0, 0);

    const result = await getAnalyticsSummary();

    expect(result.documentCount).toBe(0);
    expect(result.chunkCount).toBe(0);
    expect(result.ticketCount).toBe(0);
    expect(result.openTicketCount).toBe(0);
    expect(result.usersCount).toBe(0);
    expect(result.topQueries).toEqual([
      { q: 'how to login', count: 5 },
      { q: 'billing issue', count: 3 },
    ]);
    expect(result.coldStart).toBe(true);
  });

  it('returns correct counts from DB', async () => {
    // documents=10, chunks=50, tickets=8, open tickets=3, users=4
    counts.push(10, 50, 8, 3, 4);

    const result = await getAnalyticsSummary();

    expect(result.documentCount).toBe(10);
    expect(result.chunkCount).toBe(50);
    expect(result.ticketCount).toBe(8);
    expect(result.openTicketCount).toBe(3);
    expect(result.usersCount).toBe(4);
  });

  it('always returns topQueries as an array', async () => {
    counts.push(0, 0, 0, 0, 0);

    const result = await getAnalyticsSummary();

    expect(Array.isArray(result.topQueries)).toBe(true);
  });

  it('always returns coldStart as true', async () => {
    counts.push(0, 0, 0, 0, 0);

    const result = await getAnalyticsSummary();

    expect(result.coldStart).toBe(true);
  });

  it('returns the correct shape matching AnalyticsSummary interface', async () => {
    counts.push(1, 2, 3, 4, 5);

    const result = await getAnalyticsSummary();

    // Verify all required fields exist with correct types
    expect(typeof result.documentCount).toBe('number');
    expect(typeof result.chunkCount).toBe('number');
    expect(typeof result.ticketCount).toBe('number');
    expect(typeof result.openTicketCount).toBe('number');
    expect(typeof result.usersCount).toBe('number');
    expect(Array.isArray(result.topQueries)).toBe(true);
    expect(typeof result.coldStart).toBe('boolean');
  });
});

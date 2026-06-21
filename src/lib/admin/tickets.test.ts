import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db ────────────────────────────────────────────────────────────
// listTickets runs 2 queries:
//   1. db.select().from(tickets).where().orderBy().limit().offset()
//   2. db.select({count}).from(tickets).where()
//
// We track call order to return the right data.

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

vi.mock('@/lib/db/client', () => {
  function makeProxy(resolveWith: unknown) {
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(resolveWith);
        }
        return () => new Proxy({}, handler);
      },
    };
    return new Proxy(() => {}, handler);
  }

  return {
    db: {
      select: () => {
        const result = selectResults[selectCallIndex] ?? [];
        selectCallIndex++;
        return makeProxy(result);
      },
    },
  };
});

vi.mock('@/lib/auth/audit', () => ({
  logTicketEvent: vi.fn().mockResolvedValue(undefined),
}));

import { listTickets } from './tickets';

beforeEach(() => {
  selectCallIndex = 0;
  selectResults.length = 0;
});

describe('listTickets', () => {
  it('returns empty list when DB has no tickets', async () => {
    selectResults.push([]); // tickets query
    selectResults.push([{ count: 0 }]); // count query

    const result = await listTickets();

    expect(result.tickets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns tickets with correct shape', async () => {
    const now = new Date('2025-06-01T10:00:00Z');
    selectResults.push([
      {
        id: 1,
        ticketId: 'TKT-1001',
        userId: 'user_1',
        name: 'Alice',
        email: 'alice@example.com',
        issue: 'Cannot login',
        status: 'created',
        createdAt: now,
        assignedTo: null,
        notes: null,
      },
    ]);
    selectResults.push([{ count: 1 }]);

    const result = await listTickets();

    expect(result.tickets).toHaveLength(1);
    expect(result.total).toBe(1);

    const ticket = result.tickets[0];
    expect(ticket.ticketId).toBe('TKT-1001');
    expect(ticket.userId).toBe('user_1');
    expect(ticket.name).toBe('Alice');
    expect(ticket.email).toBe('alice@example.com');
    expect(ticket.issue).toBe('Cannot login');
    expect(ticket.status).toBe('created');
  });

  it('returns correct total count', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 25 }]);

    const result = await listTickets();

    expect(result.total).toBe(25);
  });

  it('does not crash with status filter', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const result = await listTickets({ status: 'created' });

    expect(result.tickets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does not crash with search param', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const result = await listTickets({ search: 'billing' });

    expect(result.tickets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does not crash with pagination params', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const result = await listTickets({ limit: 10, offset: 20 });

    expect(result.tickets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does not crash with assignee filter', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const result = await listTickets({ assignee: 'user_1' });

    expect(result.tickets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles multiple tickets in correct order', async () => {
    const t1 = new Date('2025-06-01T10:00:00Z');
    const t2 = new Date('2025-06-02T10:00:00Z');
    selectResults.push([
      {
        id: 2,
        ticketId: 'TKT-1002',
        userId: 'user_2',
        name: 'Bob',
        email: 'bob@example.com',
        issue: 'Bug report',
        status: 'in_progress',
        createdAt: t2,
        assignedTo: 'admin_1',
        notes: null,
      },
      {
        id: 1,
        ticketId: 'TKT-1001',
        userId: 'user_1',
        name: 'Alice',
        email: 'alice@example.com',
        issue: 'Login issue',
        status: 'created',
        createdAt: t1,
        assignedTo: null,
        notes: null,
      },
    ]);
    selectResults.push([{ count: 2 }]);

    const result = await listTickets();

    expect(result.tickets).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.tickets[0].ticketId).toBe('TKT-1002');
    expect(result.tickets[1].ticketId).toBe('TKT-1001');
  });
});

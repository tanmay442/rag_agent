import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db ────────────────────────────────────────────────────────────
// listAudit uses three db call shapes:
//   1. db.select({count}).from(table).where(...)  →  resolves to [{count: N}]
//   2. db.execute(sql`UNION ALL ...`)  →  returns { rows: [...] }
//   3. db.select({clerkUserId, name}).from(users).where(inArray(...))
//      →  resolves to [{clerkUserId, name}]
//
// We use vi.hoisted() for executeMock so it's available inside vi.mock.

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

const docCountResult = { count: 0 };
const tixCountResult = { count: 0 };
const unionRows: Array<{
  id: number;
  kind: string;
  document_id: number | null;
  ticket_id: string | null;
  actor_id: string;
  action: string;
  at: string;
}> = [];
const actorRows: Array<{ clerkUserId: string; name: string | null }> = [];

let selectCallCount = 0;

vi.mock('@/lib/db/client', () => {
  return {
    db: {
      select: (cols?: unknown) => {
        const colKeys =
          cols && typeof cols === 'object'
            ? Object.keys(cols as Record<string, unknown>)
            : [];
        if (colKeys.includes('count')) {
          const handler: ProxyHandler<object> = {
            get(_target, prop) {
              if (prop === 'then') {
                const isDoc = selectCallCount % 2 === 0;
                selectCallCount++;
                return (resolve: (v: unknown) => void) =>
                  resolve([isDoc ? docCountResult : tixCountResult]);
              }
              return () => new Proxy({}, handler);
            },
          };
          return new Proxy(() => {}, handler);
        }
        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve(actorRows);
            }
            return () => new Proxy({}, handler);
          },
        };
        return new Proxy(() => {}, handler);
      },
      execute: executeMock,
    },
  };
});

import { listAudit } from './audit';

beforeEach(() => {
  docCountResult.count = 0;
  tixCountResult.count = 0;
  unionRows.length = 0;
  actorRows.length = 0;
  selectCallCount = 0;
  executeMock.mockReset();
  executeMock.mockResolvedValue({ rows: unionRows });
});

describe('listAudit', () => {
  it('returns empty events and total 0 when DB has no rows', async () => {
    const result = await listAudit();
    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns events with correct shape from UNION ALL results', async () => {
    unionRows.push(
      {
        id: 1,
        kind: 'document',
        document_id: 42,
        ticket_id: null,
        actor_id: 'user_1',
        action: 'upload',
        at: '2025-06-01T10:00:00.000Z',
      },
      {
        id: 2,
        kind: 'ticket',
        document_id: null,
        ticket_id: 'TKT-1001',
        actor_id: 'user_2',
        action: 'create',
        at: '2025-06-01T10:00:00.000Z',
      },
    );
    actorRows.push(
      { clerkUserId: 'user_1', name: 'Alice' },
      { clerkUserId: 'user_2', name: 'Bob' },
    );

    const result = await listAudit();

    expect(result.events).toHaveLength(2);

    const doc = result.events[0];
    expect(doc.kind).toBe('document');
    expect(doc.documentId).toBe(42);
    expect(doc.ticketId).toBeNull();
    expect(doc.actorId).toBe('user_1');
    expect(doc.actorName).toBe('Alice');
    expect(doc.action).toBe('upload');
    expect(doc.at).toBeInstanceOf(Date);
    expect(doc.at.toISOString()).toBe('2025-06-01T10:00:00.000Z');

    const tix = result.events[1];
    expect(tix.kind).toBe('ticket');
    expect(tix.documentId).toBeNull();
    expect(tix.ticketId).toBe('TKT-1001');
    expect(tix.actorName).toBe('Bob');
    expect(tix.at).toBeInstanceOf(Date);
  });

  it('sums both COUNT(*) queries for total', async () => {
    docCountResult.count = 5;
    tixCountResult.count = 3;

    const result = await listAudit();
    expect(result.total).toBe(8);
  });

  it('calls db.execute for the UNION ALL query', async () => {
    await listAudit();
    expect(executeMock).toHaveBeenCalledOnce();
  });

  it('resolves actorName to null when actor not found in users table', async () => {
    unionRows.push({
      id: 1,
      kind: 'document',
      document_id: 1,
      ticket_id: null,
      actor_id: 'unknown_user',
      action: 'upload',
      at: '2025-06-01T10:00:00.000Z',
    });

    const result = await listAudit();
    expect(result.events[0].actorName).toBeNull();
    expect(result.events[0].at).toBeInstanceOf(Date);
  });

  it('handles default params (no arguments)', async () => {
    const result = await listAudit({});
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.events)).toBe(true);
    expect(typeof result.total).toBe('number');
  });
});

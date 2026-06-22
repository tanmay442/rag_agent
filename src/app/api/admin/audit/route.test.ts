import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock, listAuditMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  listAuditMock: vi.fn(),
}));

vi.mock('@/composition', () => ({
  requireAdmin: requireAdminMock,
  requireSession: requireAdminMock,
  getAppSession: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
  getComposition: () => ({ listAudit: listAuditMock }),
}));

import * as route from './route';

beforeEach(() => {
  requireAdminMock.mockReset();
  listAuditMock.mockReset();
});

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://x/api/admin/audit');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url);
}

describe('GET /api/admin/audit', () => {
  it('returns 403 for non-admin', async () => {
    const { ForbiddenError } = await import('@/composition');
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const res = await route.GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns 200 with valid JSON for admin', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' },
    });
    listAuditMock.mockResolvedValue({
      events: [
        {
          id: 1,
          kind: 'document',
          documentId: 1,
          ticketId: null,
          actorId: 'user_1',
          actorName: 'Alice',
          action: 'upload',
          at: new Date('2025-06-01T10:00:00Z'),
        },
      ],
      total: 1,
    });

    const res = await route.GET(makeReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('returns correct JSON shape matching ListAuditResult', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' },
    });
    listAuditMock.mockResolvedValue({ events: [], total: 0 });

    const res = await route.GET(makeReq());
    const body = await res.json();

    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('passes query params to listAudit', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' },
    });
    listAuditMock.mockResolvedValue({ events: [], total: 0 });

    await route.GET(makeReq({ documentId: '5', ticketId: 'TKT-1001', limit: '25', offset: '10' }));

    expect(listAuditMock).toHaveBeenCalledWith({
      documentId: 5,
      ticketId: 'TKT-1001',
      limit: 25,
      offset: 10,
    });
  });

  it('returns empty events when no audit data exists', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' },
    });
    listAuditMock.mockResolvedValue({ events: [], total: 0 });

    const res = await route.GET(makeReq());
    const body = await res.json();

    expect(body.events).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('propagates listAudit errors to Next.js (unhandled)', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' },
    });
    listAuditMock.mockRejectedValue(new Error('db down'));

    await expect(route.GET(makeReq())).rejects.toThrow('db down');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock, updateTicketMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  updateTicketMock: vi.fn(),
}));

vi.mock('@/composition', () => ({
  requireAdmin: requireAdminMock,
  requireSession: requireAdminMock,
  getAppSession: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
  getComposition: () => ({ updateTicket: updateTicketMock }),
  TICKET_STATUSES: ['created', 'in_progress', 'closed'],
  isTicketStatus: (s: string) => ['created', 'in_progress', 'closed'].includes(s),
}));

import { ForbiddenError } from '@/composition';
import * as route from './route';

beforeEach(() => {
  requireAdminMock.mockReset();
  updateTicketMock.mockReset();
});

function makeParams(ticketId: string) {
  return { params: Promise.resolve({ ticketId }) };
}

function makeReq(body: unknown) {
  return new Request('http://x/api/admin/tickets/TKT-1001', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/tickets/[ticketId]', () => {
  it('returns 403 for non-admin', async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const res = await route.PATCH(
      makeReq({ status: 'closed' }),
      makeParams('TKT-1001'),
    );
    expect(res.status).toBe(403);
  });

  it('rejects invalid status with 400', async () => {
    requireAdminMock.mockResolvedValue({ user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' } });
    const res = await route.PATCH(
      makeReq({ status: 'bogus' }),
      makeParams('TKT-1001'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing ticket', async () => {
    requireAdminMock.mockResolvedValue({ user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' } });
    updateTicketMock.mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await route.PATCH(
      makeReq({ status: 'closed' }),
      makeParams('TKT-MISSING'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 for invalid transition', async () => {
    requireAdminMock.mockResolvedValue({ user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' } });
    updateTicketMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_transition',
    });
    const res = await route.PATCH(
      makeReq({ status: 'in_progress' }),
      makeParams('TKT-1001'),
    );
    expect(res.status).toBe(409);
  });

  it('returns the updated ticket for a valid patch', async () => {
    requireAdminMock.mockResolvedValue({ user: { id: 'admin_1', email: 'a@x.com', name: 'A', role: 'admin' } });
    updateTicketMock.mockResolvedValue({
      ok: true,
      ticket: { ticketId: 'TKT-1001', status: 'closed' },
    });
    const res = await route.PATCH(
      makeReq({ status: 'closed' }),
      makeParams('TKT-1001'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ticket: { ticketId: 'TKT-1001', status: 'closed' },
    });
  });
});

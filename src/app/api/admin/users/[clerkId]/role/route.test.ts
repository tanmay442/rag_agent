import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock, setUserRoleMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  setUserRoleMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAdmin: requireAdminMock,
  requireSession: requireAdminMock,
  getAppSession: vi.fn(),
  getSession: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
}));

vi.mock('@/lib/auth/users', () => ({
  setUserRole: setUserRoleMock,
}));

import { ForbiddenError } from '@/lib/auth/session';
import * as route from './route';

beforeEach(() => {
  requireAdminMock.mockReset();
  setUserRoleMock.mockReset();
});

function makeParams(clerkId: string) {
  return { params: Promise.resolve({ clerkId }) };
}

function makeReq(body: unknown) {
  return new Request('http://x/api/admin/users/u/role', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/users/[clerkId]/role', () => {
  it('returns 403 for non-admin', async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const res = await route.POST(makeReq({ role: 'admin' }), makeParams('user_1'));
    expect(res.status).toBe(403);
  });

  it('rejects an unknown role with 400', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x', name: 'A', role: 'admin' },
    });
    const res = await route.POST(makeReq({ role: 'superuser' }), makeParams('user_1'));
    expect(res.status).toBe(400);
  });

  it('returns the updated user for a valid role', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x', name: 'A', role: 'admin' },
    });
    setUserRoleMock.mockResolvedValue({
      clerkUserId: 'user_1',
      role: 'admin',
    });
    const res = await route.POST(makeReq({ role: 'admin' }), makeParams('user_1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { clerkUserId: 'user_1', role: 'admin' },
    });
  });

  it('returns 400 for invalid JSON', async () => {
    requireAdminMock.mockResolvedValue({});
    const req = new Request('http://x/api/admin/users/u/role', {
      method: 'POST',
      body: '{ not json',
    });
    const res = await route.POST(req, makeParams('user_1'));
    expect(res.status).toBe(400);
  });
});

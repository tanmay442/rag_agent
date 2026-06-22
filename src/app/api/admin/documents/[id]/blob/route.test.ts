import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock, getDocumentByIdMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
}));

vi.mock('@/composition', () => ({
  requireAdmin: requireAdminMock,
  requireSession: requireAdminMock,
  getAppSession: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
  getComposition: () => ({ getDocumentById: getDocumentByIdMock }),
}));

import { ForbiddenError } from '@/composition';
import * as route from './route';

beforeEach(() => {
  requireAdminMock.mockReset();
  getDocumentByIdMock.mockReset();
});

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/documents/[id]/blob', () => {
  it('returns 403 when requireAdmin throws', async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const res = await route.GET(
      new Request('http://x/api/admin/documents/1/blob'),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-integer id', async () => {
    requireAdminMock.mockResolvedValue({});
    const res = await route.GET(
      new Request('http://x/api/admin/documents/abc/blob'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a missing document', async () => {
    requireAdminMock.mockResolvedValue({});
    getDocumentByIdMock.mockResolvedValue(null);
    const res = await route.GET(
      new Request('http://x/api/admin/documents/1/blob'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 410 for a soft-deleted document', async () => {
    requireAdminMock.mockResolvedValue({});
    getDocumentByIdMock.mockResolvedValue({
      id: 1,
      fileName: 'a.pdf',
      blob: Buffer.from('PDF'),
      deletedAt: new Date(),
    });
    const res = await route.GET(
      new Request('http://x/api/admin/documents/1/blob'),
      makeParams('1'),
    );
    expect(res.status).toBe(410);
  });

  it('returns 404 when the blob column is null', async () => {
    requireAdminMock.mockResolvedValue({});
    getDocumentByIdMock.mockResolvedValue({
      id: 1,
      fileName: 'a.pdf',
      blob: null,
      deletedAt: null,
    });
    const res = await route.GET(
      new Request('http://x/api/admin/documents/1/blob'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with PDF bytes for a live document', async () => {
    requireAdminMock.mockResolvedValue({});
    getDocumentByIdMock.mockResolvedValue({
      id: 1,
      fileName: 'a.pdf',
      blob: Buffer.from('%PDF-1.4 hello'),
      deletedAt: null,
    });
    const res = await route.GET(
      new Request('http://x/api/admin/documents/1/blob'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('inline');
  });
});

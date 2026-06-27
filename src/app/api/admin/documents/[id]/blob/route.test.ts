import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock, getDocumentByIdMock, requireAdminDocumentMock } = vi.hoisted(() => {
  const requireAdminMock = vi.fn();
  const getDocumentByIdMock = vi.fn();
  const requireAdminDocumentMock = vi.fn(
    async (context: { params: Promise<{ id: string }> }, opts: { allowDeleted?: boolean } = {}) => {
      try {
        await requireAdminMock();
      } catch (err) {
        if (err instanceof Error && err.constructor.name === 'ForbiddenError') {
          return { ok: false, response: new Response('Forbidden', { status: 403 }) };
        }
        throw err;
      }
      const { id } = await context.params;
      const docId = Number(id);
      if (!Number.isInteger(docId)) {
        return { ok: false, response: new Response('Invalid id', { status: 400 }) };
      }
      const doc = await getDocumentByIdMock(docId);
      if (!doc) return { ok: false, response: new Response('Not found', { status: 404 }) };
      if (!opts.allowDeleted && doc.deletedAt) {
        return { ok: false, response: new Response('Gone', { status: 410 }) };
      }
      if (!doc.blob) {
        return { ok: false, response: new Response('File unavailable', { status: 404 }) };
      }
      return { ok: true, document: doc };
    },
  );
  return { requireAdminMock, getDocumentByIdMock, requireAdminDocumentMock };
});

vi.mock('@/composition', async () => {
  const { ForbiddenError } = await import('@app/domain');
  return {
    requireAdmin: requireAdminMock,
    requireAdminDocument: requireAdminDocumentMock,
    requireSession: requireAdminMock,
    getAppSession: vi.fn(),
    ForbiddenError,
    getComposition: () => ({ getDocumentById: getDocumentByIdMock }),
  };
});

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

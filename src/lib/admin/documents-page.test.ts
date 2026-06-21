import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db ────────────────────────────────────────────────────────────
// listDocuments runs 2-3 parallel queries:
//   1. db.select({id, fileName, ...}).from(documents).leftJoin(users)...
//   2. db.select({count}).from(documents).where(...)
//   3. db.select({documentId, count}).from(chunks).where(inArray(...)).groupBy(...)
//
// getDocumentById runs:
//   db.query.documents.findFirst({where})
//
// We track call order to return the right data for each query.

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
      query: {
        documents: {
          findFirst: vi.fn().mockImplementation(async () => {
            const result = selectResults[selectCallIndex] ?? [];
            selectCallIndex++;
            return result[0] ?? null;
          }),
        },
      },
    },
  };
});

import { listDocuments, getDocumentById } from './documents';

beforeEach(() => {
  selectCallIndex = 0;
  selectResults.length = 0;
});

describe('listDocuments', () => {
  it('returns empty list when DB has no documents', async () => {
    // Query 1 (documents): empty
    selectResults.push([]);
    // Query 2 (count): 0
    selectResults.push([{ count: 0 }]);

    const result = await listDocuments();

    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns documents with correct shape', async () => {
    const now = new Date('2025-06-01T10:00:00Z');
    // Query 1 (documents with join)
    selectResults.push([
      {
        id: 1,
        fileName: 'test.pdf',
        fileHash: 'abc123',
        uploadedBy: 'user_1',
        uploadedAt: now,
        blob: null,
        deletedAt: null,
        uploaderName: 'Alice',
      },
    ]);
    // Query 2 (count)
    selectResults.push([{ count: 1 }]);
    // Query 3 (chunk counts)
    selectResults.push([{ documentId: 1, count: 5 }]);

    const result = await listDocuments();

    expect(result.documents).toHaveLength(1);
    expect(result.total).toBe(1);

    const doc = result.documents[0];
    expect(doc.id).toBe(1);
    expect(doc.fileName).toBe('test.pdf');
    expect(doc.fileHash).toBe('abc123');
    expect(doc.uploaderName).toBe('Alice');
    expect(doc.chunkCount).toBe(5);
  });

  it('assigns chunkCount 0 when no chunks exist for a document', async () => {
    selectResults.push([
      {
        id: 1,
        fileName: 'empty.pdf',
        fileHash: 'hash',
        uploadedBy: 'user_1',
        uploadedAt: new Date(),
        blob: null,
        deletedAt: null,
        uploaderName: null,
      },
    ]);
    selectResults.push([{ count: 1 }]);
    // Query 3: no chunk rows for this document
    selectResults.push([]);

    const result = await listDocuments();

    expect(result.documents[0].chunkCount).toBe(0);
  });

  it('returns correct total count', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 42 }]);

    const result = await listDocuments();

    expect(result.total).toBe(42);
  });

  it('does not crash with search param', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const result = await listDocuments({ search: 'billing' });

    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does not crash with pagination params', async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const result = await listDocuments({ limit: 10, offset: 20 });

    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('getDocumentById', () => {
  it('returns the document when found', async () => {
    const now = new Date('2025-06-01T10:00:00Z');
    selectResults.push([
      {
        id: 1,
        fileName: 'test.pdf',
        fileHash: 'abc123',
        uploadedBy: 'user_1',
        uploadedAt: now,
        blob: null,
        deletedAt: null,
      },
    ]);

    const result = await getDocumentById(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.fileName).toBe('test.pdf');
  });

  it('returns null when document is not found', async () => {
    selectResults.push([]);

    const result = await getDocumentById(999);

    expect(result).toBeNull();
  });
});

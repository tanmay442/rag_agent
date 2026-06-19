import { describe, it, expect, vi, beforeEach } from 'vitest';

// We control the db mock so we can return canned rows for the
// `count(*)` queries that the recount helpers issue. The single-doc
// case ends with `.where(...)`; the all-docs case ends with
// `.groupBy(...)`. The mock is built so both shapes resolve to
// `countRows`.

const countRows: Array<{ documentId?: number; count: number }> = [];

vi.mock('@/lib/db/client', () => {
  // Recursive proxy that resolves to `countRows` whenever awaited.
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Make the object itself thenable.
        return (resolve: (v: unknown) => void) => resolve(countRows);
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

import {
  recountChunksForDocument,
  recountChunksForAllDocuments,
} from './documents';

beforeEach(() => {
  countRows.length = 0;
});

describe('recountChunksForDocument', () => {
  it('returns the canned count for a single document', async () => {
    countRows.push({ count: 7 });
    const result = await recountChunksForDocument(42);
    expect(result).toEqual({ documentId: 42, count: 7 });
  });

  it('returns 0 when the helper gets no rows back', async () => {
    // countRows empty: helper should fall back to 0
    const result = await recountChunksForDocument(42);
    expect(result.count).toBe(0);
    expect(result.documentId).toBe(42);
  });
});

describe('recountChunksForAllDocuments', () => {
  it('returns one entry per document with its count', async () => {
    countRows.push({ documentId: 1, count: 5 });
    countRows.push({ documentId: 2, count: 9 });
    countRows.push({ documentId: 3, count: 0 });
    const result = await recountChunksForAllDocuments();
    expect(result).toEqual([
      { documentId: 1, count: 5 },
      { documentId: 2, count: 9 },
      { documentId: 3, count: 0 },
    ]);
  });

  it('returns an empty array when no documents have chunks', async () => {
    const result = await recountChunksForAllDocuments();
    expect(result).toEqual([]);
  });
});

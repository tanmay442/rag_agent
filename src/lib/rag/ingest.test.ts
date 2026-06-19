import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';

// In-memory db. We capture all rows we have seen by the SQL the where
// clause tries to express; for the simple `eq(fileName, ...)` use case
// that ingestFile needs, we just record what was queried.
function makeFakeDb() {
  const docs: Array<{
    id: number;
    fileName: string;
    fileHash: string;
    uploadedBy: string;
  }> = [];
  const ch: Array<{
    id: number;
    documentId: number;
    content: string;
    embedding: number[];
  }> = [];
  let nextDocId = 1;
  let nextChunkId = 1;

  // The real drizzle findFirst calls back with the table, not a row. For
  // our use case (eq(documents.fileName, ...)) we don't need the SQL —
  // we just look at the last query the route made.
  const findFirst = vi.fn(async () => {
    // Return the most recent matching doc by name; tests reset docs
    // between cases so the latest name match is what we want.
    return docs[docs.length - 1] ?? null;
  });
  const insertDocs = (values: { fileName: string; fileHash: string; uploadedBy: string }) => {
    const row = { ...values, id: nextDocId++ };
    docs.push(row);
    return [row];
  };
  const insertChunks = (values: Array<{ documentId: number; content: string; embedding: number[] }>) => {
    const rows = values.map((v) => ({ ...v, id: nextChunkId++ }));
    ch.push(...rows);
    return rows;
  };
  const deleteDoc = vi.fn(async (table: unknown, where: unknown) => {
    // We don't introspect the where; tests assert that all chunks for
    // a deleted document are gone.
    if (docs.length > 0) {
      const removed = docs.pop();
      if (removed) {
        for (let i = ch.length - 1; i >= 0; i--) {
          if (ch[i]!.documentId === removed.id) ch.splice(i, 1);
        }
      }
    }
    return { table, where };
  });

  return {
    docs,
    chunks: ch,
    query: { documents: { findFirst } },
    insert: (table: { __tableName: string }) => {
      const run = () => {
        if (table.__tableName === 'documents') {
          const v = (run as { _value?: unknown })._value as { fileName: string; fileHash: string; uploadedBy: string };
          return insertDocs(v);
        }
        const v = (run as { _value?: unknown })._value as Array<{ documentId: number; content: string; embedding: number[] }>;
        return insertChunks(v);
      };
      const builder: { returning: () => Promise<unknown>; then: <T>(fn: (v: unknown) => T) => Promise<T> } = {
        returning: async () => run() as unknown as Promise<unknown>,
        then: <T,>(fn: (v: unknown) => T) => Promise.resolve(run()).then(fn) as Promise<T>,
      };
      return {
        values: (v: unknown) => {
          (run as { _value?: unknown })._value = v;
          return builder;
        },
      };
    },
    // Drizzle's delete API: db.delete(table).where(cond)
    delete: () => ({
      where: (cond: unknown) => deleteDoc(undefined, cond),
    }),
  };
}

vi.mock('@/lib/db/client', () => ({ db: makeFakeDb() }));
vi.mock('@/lib/db/schema', () => ({
  documents: { __tableName: 'documents' },
  chunks: { __tableName: 'chunks' },
}));
vi.mock('@/lib/llm/client', () => ({
  getEmbeddingModel: () => ({ modelId: 'gemini-embedding-001' }),
  EMBEDDING_OPTIONS: { outputDimensionality: 768 },
}));
vi.mock('pdf-parse', () => ({
  default: async (data: Uint8Array) => {
    const text = new TextDecoder('utf-8').decode(data);
    return {
      pages: [{ num: 1, text: `EXTRACTED:${text}` }],
      text: `EXTRACTED:${text}`,
      total: 1,
    };
  },
}));
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    embed: vi.fn(async ({ value }: { value: string }) => ({
      embedding: [value.length, value.length + 1, value.length + 2, 0],
    })),
  };
});

import { ingestFile, extractText, chunkText, embedChunks } from './ingest';
import { db } from '@/lib/db/client';

const fakeDb = db as unknown as ReturnType<typeof makeFakeDb>;

describe('ingest helpers', () => {
  beforeEach(() => {
    fakeDb.docs.length = 0;
    fakeDb.chunks.length = 0;
    fakeDb.query.documents.findFirst.mockClear();
  });

  it('extractText routes through pdf-parse', async () => {
    const text = await extractText(Buffer.from('Hello World'));
    expect(text).toBe('EXTRACTED:Hello World');
  });

  it('chunkText splits with overlap', async () => {
    const text = 'a'.repeat(400);
    const chunks = await chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0]?.length).toBe(150);
  });

  it('embedChunks returns one embedding per input', async () => {
    const embeddings = await embedChunks(['hi', 'hello']);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toEqual([2, 3, 4, 0]);
    expect(embeddings[1]).toEqual([5, 6, 7, 0]);
  });
});

describe('ingestFile', () => {
  beforeEach(() => {
    fakeDb.docs.length = 0;
    fakeDb.chunks.length = 0;
    fakeDb.query.documents.findFirst.mockClear();
  });

  it('inserts a new document and chunks on first upload', async () => {
    const result = await ingestFile({
      fileName: 'policy.pdf',
      buffer: Buffer.from('Policy content here'),
      uploadedBy: 'user-1',
    });
    expect(result.status).toBe('inserted');
    expect(result.chunks).toBeGreaterThan(0);
    expect(fakeDb.docs).toHaveLength(1);
    expect(fakeDb.docs[0]?.fileName).toBe('policy.pdf');
    expect(fakeDb.chunks.every((c) => c.documentId === result.documentId)).toBe(true);
  });

  it('skips insertion when hash matches an existing document', async () => {
    const first = await ingestFile({
      fileName: 'policy.pdf',
      buffer: Buffer.from('Same content'),
      uploadedBy: 'user-1',
    });
    const firstChunks = fakeDb.chunks.length;
    expect(first.status).toBe('inserted');

    const second = await ingestFile({
      fileName: 'policy.pdf',
      buffer: Buffer.from('Same content'),
      uploadedBy: 'user-1',
    });
    expect(second.status).toBe('unchanged');
    expect(second.documentId).toBe(first.documentId);
    expect(fakeDb.chunks.length).toBe(firstChunks);
    expect(fakeDb.docs).toHaveLength(1);
  });

  it('replaces the document and its chunks when hash differs', async () => {
    const first = await ingestFile({
      fileName: 'policy.pdf',
      buffer: Buffer.from('Version 1'),
      uploadedBy: 'user-1',
    });
    const firstDocId = first.documentId;
    expect(fakeDb.chunks.some((c) => c.documentId === firstDocId)).toBe(true);

    const second = await ingestFile({
      fileName: 'policy.pdf',
      buffer: Buffer.from('Version 2 - completely different text'),
      uploadedBy: 'user-1',
    });
    expect(second.status).toBe('updated');
    expect(second.documentId).not.toBe(firstDocId);
    expect(fakeDb.chunks.some((c) => c.documentId === firstDocId)).toBe(false);
    expect(fakeDb.chunks.some((c) => c.documentId === second.documentId)).toBe(true);
    expect(fakeDb.docs).toHaveLength(1);
    expect(fakeDb.docs[0]?.fileName).toBe('policy.pdf');
  });
});

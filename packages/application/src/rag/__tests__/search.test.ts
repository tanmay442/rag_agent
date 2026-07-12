import { describe, it, expect, vi } from 'vitest';
import { searchChunks } from '../search';
import type { SearchDeps } from '../search';

function makeDeps(overrides?: Partial<SearchDeps>): SearchDeps {
  const searchHybrid = vi.fn().mockResolvedValue([
    { id: 1, content: 'alpha', similarity: 0.9, docTitle: 'Doc A' },
    { id: 2, content: 'beta', similarity: 0.8, docTitle: 'Doc A' },
  ]);
  return {
    chunks: {
      insertMany: vi.fn(),
      deleteByDocumentId: vi.fn(),
      searchHybrid,
      countForDocuments: vi.fn(),
      countForAll: vi.fn(),
      countForDocument: vi.fn(),
      recountAll: vi.fn(),
    },
    embeddings: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn(),
    },
    reranker: { rerank: vi.fn().mockResolvedValue(['1', '2']) },
    retrieveK: 20,
    vecK: 20,
    ftsK: 20,
    ...overrides,
  };
}

describe('searchChunks', () => {
  it('propagates DB errors as ExternalServiceError', async () => {
    const deps = makeDeps({
      chunks: {
        ...makeDeps().chunks,
        searchHybrid: vi.fn().mockRejectedValue(new Error('connection refused')),
      },
    });
    const result = await searchChunks('test', {}, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Vector search failed/);
    }
  });

  it('returns empty array for blank query without embedding', async () => {
    const embed = vi.fn();
    const deps = makeDeps({
      embeddings: { embed, embedBatch: vi.fn() },
    });
    const result = await searchChunks('   ', {}, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(embed).not.toHaveBeenCalled();
  });

  it('returns results with id and docTitle mapped through from hybrid search', async () => {
    const deps = makeDeps();
    const result = await searchChunks('test', {}, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      for (const c of result.value) {
        expect(typeof c.id).toBe('number');
        expect(c.docTitle).toBe('Doc A');
      }
    }
  });

  it('follows the reranker order when reranker reorders ids', async () => {
    const deps = makeDeps({
      chunks: {
        ...makeDeps().chunks,
        searchHybrid: vi.fn().mockResolvedValue([
          { id: 1, content: 'one', similarity: 0.9 },
          { id: 2, content: 'two', similarity: 0.8 },
          { id: 3, content: 'three', similarity: 0.7 },
        ]),
      },
      reranker: { rerank: vi.fn().mockResolvedValue(['3', '1', '2']) },
    });
    const result = await searchChunks('test', {}, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((c) => c.content)).toEqual(['three', 'one', 'two']);
    }
  });
});

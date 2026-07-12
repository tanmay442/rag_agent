import { describe, it, expect, vi, afterEach } from 'vitest';
import { getReranker } from '../index';
import type { RerankCandidate } from '@app/domain';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => data,
  } as Response);
}

const candidates: RerankCandidate[] = [
  { id: 'a', content: 'alpha' },
  { id: 'b', content: 'beta' },
  { id: 'c', content: 'gamma' },
];

describe('rrf reranker', () => {
  it('returns candidate ids in order, sliced to topK', async () => {
    const r = getReranker('rrf', {});
    const ids = await r.rerank('q', candidates, 2);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('cohere reranker', () => {
  it('reorders ids from a successful Cohere v2 response', async () => {
    global.fetch = jsonFetch({ results: [{ index: 1 }, { index: 0 }] });
    const r = getReranker('cohere', { COHERE_API_KEY: 'k' });
    const ids = await r.rerank('q', candidates, 2);
    expect(ids).toEqual(['b', 'a']);
  });

  it('falls back to original order when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const r = getReranker('cohere', { COHERE_API_KEY: 'k' });
    const ids = await r.rerank('q', candidates, 2);
    expect(ids).toEqual(['a', 'b']);
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('gemini reranker', () => {
  it('reorders ids from a successful Gemini ranking response', async () => {
    global.fetch = jsonFetch({
      candidates: [
        { content: { parts: [{ text: '["3","1","2"]' }] } },
      ],
    });
    const r = getReranker('gemini', { AI_STUDIO_KEY: 'x' });
    const ids = await r.rerank('q', candidates, 3);
    expect(ids).toEqual(['c', 'a', 'b']);
  });

  it('falls back to original order when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const r = getReranker('gemini', { AI_STUDIO_KEY: 'x' });
    const ids = await r.rerank('q', candidates, 2);
    expect(ids).toEqual(['a', 'b']);
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('getReranker factory', () => {
  it('returns the rrf reranker for rrf', async () => {
    const r = getReranker('rrf', {});
    expect(await r.rerank('q', candidates, 3)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to rrf when cohere key is missing', async () => {
    const r = getReranker('cohere', {});
    expect(await r.rerank('q', candidates, 3)).toEqual(['a', 'b', 'c']);
  });

  it('returns a gemini reranker when ai studio key is present', async () => {
    global.fetch = jsonFetch({
      candidates: [
        { content: { parts: [{ text: '["2","1","3"]' }] } },
      ],
    });
    const r = getReranker('gemini', { AI_STUDIO_KEY: 'x' });
    expect(await r.rerank('q', candidates, 3)).toEqual(['b', 'a', 'c']);
  });
});

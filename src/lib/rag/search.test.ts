import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the `embed` function from `ai` so the search test never hits the
// network, and mock the db client so we control what `db.execute` returns.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    embed: vi.fn(),
  };
});

vi.mock('@/lib/db/client', () => {
  return {
    db: {
      execute: vi.fn(),
    },
  };
});

import { searchChunks, SIMILARITY_THRESHOLD, DEFAULT_LIMIT } from './search';
import { db } from '@/lib/db/client';
import { embed } from 'ai';

const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;
const embedMock = embed as unknown as ReturnType<typeof vi.fn>;

describe('searchChunks', () => {
  beforeEach(() => {
    executeMock.mockReset();
    embedMock.mockReset();
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
  });

  it('returns parsed rows in db order', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { content: 'first doc chunk', similarity: 0.92 },
        { content: 'second doc chunk', similarity: 0.71 },
      ],
    });

    const results = await searchChunks('How do I claim dental?', { limit: 5 });

    expect(results).toEqual([
      { content: 'first doc chunk', similarity: 0.92 },
      { content: 'second doc chunk', similarity: 0.71 },
    ]);
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('embeds the user query before searching', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    await searchChunks('test query', { threshold: 0.7, limit: 2 });
    expect(embedMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'test query' }),
    );
  });


  function flattenSqlChunks(chunks: unknown): string {
    if (chunks == null) return '';
    if (typeof chunks === 'string') return chunks;
    if (typeof chunks === 'number' || typeof chunks === 'boolean') return String(chunks);
    if (Array.isArray(chunks)) return chunks.map(flattenSqlChunks).join('');
    if (typeof chunks === 'object') {
      const obj = chunks as { queryChunks?: unknown; value?: unknown };
      if (obj.queryChunks) return flattenSqlChunks(obj.queryChunks);
      if (Array.isArray(obj.value)) return obj.value.map(flattenSqlChunks).join('');
      return '';
    }
    return '';
  }

  it('passes threshold + limit into the SQL', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    await searchChunks('test', { threshold: 0.7, limit: 2 });
    const sqlArg = executeMock.mock.calls[0]?.[0] as { queryChunks?: unknown } | undefined;
    const text = flattenSqlChunks(sqlArg?.queryChunks);
    expect(text).toContain('1 - (embedding <=>');
    expect(text).toContain('LIMIT');
  });

  it('exports sensible defaults', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.5);
    expect(DEFAULT_LIMIT).toBe(3);
  });

  it('handles a missing `rows` property (older driver) gracefully', async () => {
    executeMock.mockResolvedValueOnce({});
    const results = await searchChunks('anything');
    expect(results).toEqual([]);
  });

  it('coerces string similarities to numbers', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ content: 'snip', similarity: '0.83' }],
    });
    const [first] = await searchChunks('x');
    expect(first?.similarity).toBe(0.83);
  });
});

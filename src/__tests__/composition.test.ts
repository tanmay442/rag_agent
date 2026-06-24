import { describe, it, expect } from 'vitest';
import { parseQueryPagination } from '@/composition';

describe('parseQueryPagination', () => {
  it('falls back to defaults when given NaN values', () => {
    const url = new URL('http://localhost/api/test?limit=abc&offset=xyz');
    const { limit, offset } = parseQueryPagination(url);
    expect(limit).toBe(25);
    expect(offset).toBe(0);
  });

  it('uses provided defaults', () => {
    const url = new URL('http://localhost/api/test');
    const { limit, offset } = parseQueryPagination(url, { limit: 50, offset: 10 });
    expect(limit).toBe(50);
    expect(offset).toBe(10);
  });

  it('parses valid query params', () => {
    const url = new URL('http://localhost/api/test?limit=10&offset=5');
    const { limit, offset } = parseQueryPagination(url);
    expect(limit).toBe(10);
    expect(offset).toBe(5);
  });
});

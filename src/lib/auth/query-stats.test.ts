import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordQuery,
  getTopQueries,
  __resetQueryStatsForTests,
} from './query-stats';

describe('query-stats', () => {
  beforeEach(() => {
    __resetQueryStatsForTests();
  });

  it('counts repeated queries for the same user', () => {
    recordQuery('user-1', 'What time does school start?');
    recordQuery('user-1', 'what time does school start?');
    recordQuery('user-1', '  WHAT TIME DOES SCHOOL START?  ');
    const top = getTopQueries();
    expect(top.length).toBe(1);
    expect(top[0]?.count).toBe(3);
  });

  it('keeps queries per-user separate', () => {
    recordQuery('user-1', 'hours');
    recordQuery('user-2', 'hours');
    const top = getTopQueries();
    expect(top[0]?.count).toBe(2);
  });

  it('returns the top N sorted by count', () => {
    recordQuery('user-1', 'a');
    recordQuery('user-1', 'a');
    recordQuery('user-1', 'a');
    recordQuery('user-1', 'b');
    recordQuery('user-1', 'b');
    recordQuery('user-1', 'c');
    const top = getTopQueries();
    expect(top.map((q) => q.q)).toEqual(['a', 'b', 'c']);
  });

  it('ignores empty queries', () => {
    recordQuery('user-1', '');
    recordQuery('user-1', '   ');
    expect(getTopQueries()).toEqual([]);
  });
});

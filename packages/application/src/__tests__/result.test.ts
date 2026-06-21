import { describe, it, expect } from 'vitest';
import { ok, err, map, flatMap, mapErr, unwrap, unwrapOr, isOk, isErr } from '@app/domain';

describe('Result', () => {
  it('ok / err constructors', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    const e = new Error('boom');
    expect(err(e)).toEqual({ ok: false, error: e });
  });
  it('map / flatMap / mapErr', () => {
    expect(map(ok(2), (v) => v + 1)).toEqual({ ok: true, value: 3 });
    expect(map(err(new Error('e')), (v: number) => v + 1).ok).toBe(false);
    expect(flatMap(ok(2), (v) => ok(v * 3))).toEqual({ ok: true, value: 6 });
    expect(flatMap(ok(2), () => err(new Error('e'))).ok).toBe(false);
    const e = new Error('x');
    expect(mapErr(err(e), (e) => e.message)).toEqual({ ok: false, error: 'x' });
  });
  it('unwrap / unwrapOr', () => {
    expect(unwrap(ok(7))).toBe(7);
    expect(unwrapOr(err(new Error('e')), 'fallback')).toBe('fallback');
    expect(() => unwrap(err(new Error('e')))).toThrow();
  });
  it('isOk / isErr', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err(new Error('e')))).toBe(true);
  });
});

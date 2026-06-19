import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We re-import the module under test in each scenario so the
// module-scope `pool = getPool()` runs against the env we set up.
async function importFresh() {
  vi.resetModules();
  return import('./client');
}

describe('db client', () => {
  const ORIGINAL_ENV = process.env.DATABASE_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_ENV;
  });

  it('imports cleanly when DATABASE_URL is not set (no module-load throw)', async () => {
    // The point: the previous version of this file threw at
    // import time, which broke `next build` and any test that
    // transitively imported this module. The new version must
    // not throw on import.
    await expect(importFresh()).resolves.toBeDefined();
  });

  it('exports a `db` whose methods reject with a clear DATABASE_URL error', async () => {
    const mod = await importFresh();
    expect(typeof mod.db.select).toBe('function');
    // Drizzle wraps the underlying pool.query() rejection in a
    // DrizzleQueryError whose `.cause` is the original Error.
    // Inspect `.cause` so we verify the real failure mode
    // ("DATABASE_URL is not set") rather than Drizzle's wrapper
    // text ("Failed query: ...").
    const promise = mod.db
      .select()
      .from(
        mod.schema.documents ??
          (mod.schema as { documents?: unknown }).documents as never,
      );
    await expect(promise).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringMatching(/DATABASE_URL is not set/),
      }),
    });
  });

  it('exports the same `db` shape regardless of env (callers do not branch)', async () => {
    const modA = await importFresh();
    const aKeys = new Set(Object.keys(modA));
    process.env.DATABASE_URL = 'postgres://user:pw@host:5432/db?sslmode=require';
    const modB = await importFresh();
    const bKeys = new Set(Object.keys(modB));
    // Both have at least the same top-level exports.
    for (const k of ['db', 'schema']) {
      expect(aKeys.has(k)).toBe(true);
      expect(bKeys.has(k)).toBe(true);
    }
  });
});

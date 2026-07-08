# Session 07: Tests — Full @effect/vitest Migration

## Objective

Convert all 26 test files to `@effect/vitest`. Use `it.effect` for Effect-based
tests, `it.live` for tests needing real time. Create test layers for all
service mocks. Maintain 230 test equivalents with full coverage.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-06.md` first.

Key things to know:
- All code is Effect-based (services, use-cases, routes, actions)
- Tests were partially updated in Sessions 3-6 but still use plain vitest
- `@effect/vitest` is installed but not yet used

---

## Implementation

### Phase 1: Test Infrastructure

#### 1. Update `vitest.config.ts`

Ensure the vitest config supports `@effect/vitest`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    environment: "node",
  },
});
```

#### 2. Create test layer utilities

Test utilities with mock implementations should live in a **test
helpers** directory, NOT in the domain layer (domain must stay pure —
no mock implementations of services in there).

Create `packages/application/src/__tests__/test-layers.ts`:

```typescript
import { Effect, Layer } from "effect";
import { Documents, Chunks, Tickets, Users, Audit, Embeddings, BlobStorage, IngestQueue, PdfParser, TextSplitter, Clock, Hasher, RateLimiter, QueryStats } from "@app/domain";

// In-memory test implementations — these are test doubles, not production code.
// They live in the application package's test directory because they
// depend on domain service interfaces (which application is allowed to import).

export const TestDocumentsLive = Layer.sync(Documents, () => {
  const store = new Map<number, DocumentRow>();
  return {
    findById: (id) => Effect.sync(() => store.get(id) ?? null),
    findByName: (name) => Effect.sync(() => Array.from(store.values()).find(d => d.fileName === name) ?? null),
    insert: (input) => Effect.sync(() => {
      const row = { id: store.size + 1, ...input, uploadedAt: new Date(), storageKey: null, ingestStatus: 'done' as const, deletedAt: null };
      store.set(row.id, row);
      return row;
    }),
    // ... etc
  };
});

// Similar test layers for Chunks, Tickets, Users, Audit, etc.

// Compose all test layers into one for easy `Effect.provide(testLayer)`
export const testLayer = Layer.mergeAll(
  TestDocumentsLive,
  TestChunksLive,
  TestTicketsLive,
  TestUsersLive,
  TestAuditLive,
  TestEmbeddingsLive,
  TestBlobStorageLive,
  TestIngestQueueLive,
  TestPdfParserLive,
  TestTextSplitterLive,
  TestRateLimiterLive,
  TestQueryStatsLive,
  TestClockLive,
  TestHasherLive,
);
```

**Note:** Individual tests may need to override specific layers (e.g.,
to simulate an embedding failure). Use `Layer.provide` to override:

```typescript
const failingEmbeddings = Layer.succeed(Embeddings, {
  embed: () => Effect.fail(new ExternalServiceError('Embedding failed')),
  embedBatch: () => Effect.fail(new ExternalServiceError('Embedding failed')),
});

it.effect("searchChunks returns error on embedding failure", () =>
  Effect.gen(function* () {
    const exit = yield* searchChunks("test", {}).pipe(Effect.exit);
    expect(exit._tag).toBe("Failure");
  }).pipe(Effect.provide(testLayer.pipe(Layer.provide(failingEmbeddings))))
);
```

### Phase 2: Convert Test Files

#### 3. Convert package tests

Files:
- `packages/application/src/__tests__/result.test.ts` → DELETE (Result is gone)
- `packages/application/src/admin/__tests__/documents.test.ts`
- `packages/application/src/admin/__tests__/tickets.test.ts`
- `packages/application/src/auth/__tests__/users.test.ts`
- `packages/application/src/rag/__tests__/ingest.integration.test.ts`
- `packages/application/src/rag/__tests__/search.test.ts`
- `packages/infrastructure/src/llm/index.test.ts`
- `packages/infrastructure/src/queue/index.test.ts`
- `packages/infrastructure/src/auth/upstash-rate-limiter.test.ts`
- `packages/infrastructure/src/auth/upstash-query-stats.test.ts`
- `packages/cli/src/__tests__/init.test.ts`

**Pattern for each:**

Current (plain vitest):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@app/domain';

it("returns error on failure", async () => {
  const result = await someUseCase(args);
  expect(result.ok).toBe(false);
  expect(result.error).toBeInstanceOf(NotFoundError);
});
```

New (@effect/vitest):
```typescript
import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { NotFoundError } from "@app/domain";

it.effect("returns error on failure", () =>
  Effect.gen(function* () {
    const exit = yield* someUseCase(args).pipe(Effect.exit);
    expect(exit._tag).toBe("Failure");
    expect(exit.cause._tag).toBe("Fail");
    expect(exit.cause.error._tag).toBe("NotFoundError");
  }).pipe(Effect.provide(testLayer))
);
```

Or simpler for success cases:
```typescript
it.effect("returns data on success", () =>
  Effect.gen(function* () {
    const result = yield* someUseCase(args);
    expect(result).toMatchObject({ ... });
  }).pipe(Effect.provide(testLayer))
);
```

#### 4. Convert src tests

Files:
- `src/__tests__/composition.test.ts` → DELETE or convert (composition changed)
- `src/lib/__tests__/env.test.ts` → convert to Effect Config testing
- `src/lib/__tests__/sanitize.test.ts` → stays as plain vitest (pure functions)
- `src/lib/__tests__/http.test.ts` → convert to Effect error testing
- `src/app/api/chat/route.test.ts`
- `src/app/api/admin/ingest-worker/route.test.ts`
- `src/app/api/admin/audit/route.test.ts`
- `src/app/api/admin/tickets/[ticketId]/route.test.ts`
- `src/app/api/admin/users/[clerkId]/role/route.test.ts`
- `src/app/api/admin/documents/[id]/blob/route.test.ts`
- `src/app/(app)/admin/actions.test.ts`
- `src/proxy.test.ts` → stays as plain vitest (middleware, edge runtime)
- `src/components/ChatInterface.test.tsx` → stays as plain vitest (React component)

#### 5. Convert script tests

Files:
- `scripts/seed-docs.test.ts`
- `scripts/apply-migration.test.ts`
- `scripts/setup-test-db.test.ts`

These can stay as plain vitest since they test scripts, not Effect services.

### Phase 3: Ensure Full Coverage

#### 6. Verify test count

After conversion, verify all 230 test equivalents exist. If any tests
were removed (like `result.test.ts`), ensure the equivalent assertions
exist elsewhere.

Specifically:
- `result.test.ts` tested `ok`, `err`, `map`, `flatMap`, `unwrap`, etc.
  These are now Effect primitives — the tests for them are Effect's own
  tests. Remove the file; the equivalent coverage is provided by the
  use-case tests that verify Effect compositions.

#### 7. Create missing test layers

Ensure every test file has access to the services it needs. Create
test layers for:
- All DB repositories (in-memory)
- LLM services (mocked)
- Blob storage (filesystem)
- Queue (sync)
- Rate limiter (in-memory)
- Query stats (in-memory)
- Auth/session (mocked)

#### 8. Update test assertions

Replace all `result.ok` / `result.error` / `result.value` patterns with
Effect-based assertions:
- Success: `expect(result).toEqual(expected)`
- Failure: check `exit._tag === "Failure"` and `exit.cause.error._tag`

---

## Env Vars

No new env vars. Test env vars (`.env.test`) stay the same.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

- All 26 test files — converted to @effect/vitest or confirmed as plain vitest
- `packages/application/src/__tests__/result.test.ts` — deleted
- New file: test layer utilities (shared mock implementations)
- `vitest.config.ts` — possibly updated

---

## Gotchas / Things to Watch Out For

1. **`it.effect` vs `it.live`**: Use `it.effect` for most tests (provides
   TestClock). Use `it.live` only when you need real time behavior.

2. **Test layer per test**: By default, provide a fresh layer per test
   via `Effect.provide(testLayer)`. This prevents state leakage between
   tests. Use `it.layer` only for expensive shared resources.

3. **Effect error assertions**: To assert a specific error, use:
   ```typescript
   const exit = yield* program.pipe(Effect.exit);
   expect(exit._tag).toBe("Failure");
   if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
     expect(exit.cause.error._tag).toBe("NotFoundError");
   }
   ```

4. **React component tests**: `ChatInterface.test.tsx` tests React
   rendering. Keep as plain vitest with `@testing-library/react`.

5. **Middleware tests**: `proxy.test.ts` tests Next.js middleware.
   Keep as plain vitest.

---

## Validation

```bash
pnpm typecheck    # tsc — must pass
pnpm lint         # eslint — must pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass
```

---

## Git Commit Strategy

```bash
git add -A
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-07): convert test suite to @effect/vitest

Convert all 26 test files to @effect/vitest. Use it.effect for
Effect-based tests. Create shared test layers for service mocks.
Delete result.test.ts (Result is gone). Maintain 230 test equivalents
with full coverage.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

---

## Handoff Instructions

Write `docs/effect-migration/context/after-session-07.md`. Include:

1. **Confirm all 230 tests pass**: note any test count changes
2. **List test files converted**: which use it.effect, which stay plain
3. **List test layers created**: shared mock implementations
4. **Confirm result.test.ts deleted**: equivalent coverage verified
5. **Tell the next agent**: "Tests are fully migrated. Session 8 is the
   final cleanup — logger, config, scripts, Docker verification."

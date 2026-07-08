# Session 03: Services, Repositories, Result → Effect — The Big Migration

## Objective

This is the **largest and most critical session**. It changes the entire type
system of the codebase: `Result<T,E>` → `Effect<A,E,R>`, `Promise<T>` →
`Effect<T,E,R>`, manual DI → `Context.Service` + `Layer`.

Every port interface, every implementation, every use-case, every route, and
every test changes in this session. The reward: a fully Effect-native codebase
with typed errors, service-based DI, and composable effects.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-02.md` first.

Key things to know:
- Errors are `Schema.TaggedError` with `_tag` discrimination
- Zod is removed, Effect Schema is the validation library
- Branded IDs are available but not yet used in interfaces
- `Result<T,E>` still exists as a union type

---

## Implementation

This session has three phases:
1. **Domain services** — redefine ports as Effect services
2. **Infrastructure** — convert repository implementations to Effect
3. **Application** — convert use-cases to Effect, remove Result

### Phase 1: Domain Services

#### 1. Create `packages/domain/src/services.ts`

This file replaces `ports.ts` with Effect `Context.Service` definitions.
Every service is a `Context.Service` with an Effect return type.

**Key pattern:**
```typescript
import { Context, Effect } from "effect";

export class Documents extends Context.Service<Documents, {
  readonly findById: (id: DocumentId) => Effect.Effect<DocumentRow | null, NotFoundError>;
  readonly findByName: (name: string) => Effect.Effect<DocumentRow | null, NotFoundError>;
  readonly insert: (input: InsertDocumentInput) => Effect.Effect<DocumentRow, ValidationError>;
  readonly deleteById: (id: DocumentId) => Effect.Effect<void>;
  readonly list: (opts: ListDocumentsOpts) => Effect.Effect<ListDocumentsResult>;
  // ... etc
}>()("@app/Documents") {}
```

**Services to define:**
- `Documents` — document CRUD
- `Chunks` — chunk search and insert
- `Tickets` — ticket CRUD
- `Users` — user CRUD and Clerk sync
- `Audit` — audit logging
- `RateLimiter` — rate limit checks
- `QueryStats` — query recording and top queries
- `Embeddings` — embedding generation
- `ChatModel` — LLM chat model
- `BlobStorage` — object storage
- `IngestQueue` — async ingest queue
- `PdfParser` — PDF text extraction
- `TextSplitter` — text chunking
- `TransactionRunner` — DB transaction execution
- `Clock` — time source
- `Hasher` — SHA-256 hashing
- `SessionStore` — auth session resolution

**For each service, define:**
- The service interface (methods and their Effect signatures)
- Input/output types (use branded IDs where applicable)

#### 2. Replace `packages/domain/src/ports.ts`

Delete the old `ports.ts`. The new `services.ts` replaces it. Update
`packages/domain/src/index.ts` to export from `services.ts` instead of
`ports.ts`.

#### 3. Remove `packages/domain/src/result.ts`

Delete the file entirely. All callers will use `Effect<A,E,R>` directly.

The `ok()` helper becomes `Effect.succeed()`, `err()` becomes
`Effect.fail()`, `map` becomes `Effect.map`, `flatMap` becomes
`Effect.flatMap`, etc.

Update `packages/domain/src/index.ts` to remove the result export.

### Phase 2: Infrastructure — Repositories

#### 4. Convert `packages/infrastructure/src/db/repositories.ts`

Each repository function currently returns `Promise<T>`. Convert to
`Effect<T, DomainError, never>`.

**Pattern for each function:**

Current:
```typescript
export async function findDocumentByName(name: string, client: Client = db): Promise<Document | null> {
  const row = await client.query.documents.findFirst({ where: eq(documents.fileName, name) });
  return (row as Document | undefined) ?? null;
}
```

New:
```typescript
export function findDocumentByName(name: string, client: Client = db): Effect.Effect<Document | null, never> {
  return Effect.tryPromise({
    try: () => client.query.documents.findFirst({ where: eq(documents.fileName, name) }),
    catch: (error) => new ExternalServiceError('Failed to find document', error),
  }).pipe(Effect.map((row) => (row as Document | undefined) ?? null));
}
```

For functions that throw domain errors:
```typescript
export function insertDocument(
  input: { fileName: string; fileHash: string; uploadedBy: string },
  client: Client = db,
): Effect.Effect<Document, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const [row] = await client.insert(documents).values(input).returning();
      if (!row) throw new Error('Failed to insert document');
      return row as Document;
    },
    catch: (error) => new ExternalServiceError('Failed to insert document', error),
  });
}
```

For the vector search:
```typescript
export function searchChunksByVector(
  embedding: number[],
  opts: { threshold: number; limit: number },
  client: Client = db,
): Effect.Effect<Array<{ content: string; similarity: number }>, ExternalServiceError> {
  return Effect.gen(function* () {
    // Validate embedding
    if (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every((v) => Number.isFinite(v))) {
      return yield* Effect.fail(new ExternalServiceError('Invalid embedding'));
    }
    // Execute query
    const vectorLiteral = `[${embedding.join(',')}]`;
    const result = yield* Effect.tryPromise({
      try: () => client.execute(sql`...`),
      catch: (error) => new ExternalServiceError('Vector search failed', error),
    });
    const rows = (result as unknown as { rows?: ... }).rows ?? [];
    return rows.map((r) => ({ content: r.content, similarity: Number(r.similarity) }));
  });
}
```

**Functions to convert:** All ~25 repository functions in the file.

#### 5. Convert repository factory functions

The current `createDocumentRepo`, `createChunkRepo`, etc. return plain
objects. Convert to Effect services:

```typescript
export function createDocumentRepo(client: Client): Effect.Effect<Documents, never> {
  return Effect.succeed({
    findById: (id) => findDocumentById(id, client),
    findByName: (name) => findDocumentByName(name, client),
    insert: (input) => insertDocument(input, client),
    deleteById: (id) => deleteDocumentById(id, client),
    list: (opts) => listDocuments(opts, client),
    // ... etc
  });
}
```

Wait — the services are `Context.Service` types, not plain objects. The
factory should return the service implementation. The correct pattern:

```typescript
import { Layer } from "effect";

export const DocumentsLive = Layer.effect(
  Documents,
  Effect.gen(function* () {
    const client = yield* DbClient;
    return {
      findById: (id) => findDocumentById(id, client),
      // ... etc
    };
  })
);
```

Where `DbClient` is a service that holds the Drizzle client. Create:

```typescript
export class DbClient extends Context.Service<DbClient, {
  readonly client: Client;
}>()("@app/DbClient") {}
```

#### 6. Create `packages/infrastructure/src/db/services.ts`

This file creates the live layers for all DB services. You can either:

**Option A:** Keep `repositories.ts` as a single file and export layers from it. Then `services.ts` just re-exports:

```typescript
import { Layer } from "effect";
// Layers are defined at the bottom of repositories.ts
export { DocumentsLive, ChunksLive, TicketsLive, UsersLive, AuditLive } from "./repositories";

export const DbServicesLayer = Layer.mergeAll(
  DocumentsLive,
  ChunksLive,
  TicketsLive,
  UsersLive,
  AuditLive,
);
```

**Option B:** Split `repositories.ts` into per-entity files (`repositories/documents.ts`, `repositories/chunks.ts`, etc.). Each file exports its own `XxxLive` layer.

Either approach is fine — pick whichever is cleaner for the file size. If `repositories.ts` is already manageable as one file, keep it as Option A.

#### 7. Convert `TransactionRunner`

The current `TransactionRunner` returns `Promise<T>`. Convert to Effect:

```typescript
export class TransactionRunner extends Context.Service<TransactionRunner, {
  readonly run: <A, E, R>(fn: (ctx: TransactionContext) => Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}>()("@app/TransactionRunner") {}

export const TransactionRunnerLive = Layer.effect(
  TransactionRunner,
  Effect.gen(function* () {
    const dbClient = yield* DbClient;
    return {
      run: (fn) => Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => dbClient.client.transaction(async (tx) => {
            const ctx = createTransactionContext(tx);
            return yield* fn(ctx).pipe(Effect.runPromise);
          }),
          catch: (error) => new ExternalServiceError('Transaction failed', error),
        });
        return result;
      }),
    };
  })
);
```

**Exception to the "no `Effect.runPromise` in business logic" rule:**
The `Effect.runPromise` inside `db.transaction`'s callback is a
**necessary exception**. Drizzle's `db.transaction()` requires a regular
async callback — it manages the transaction lifecycle. We must run the
Effect-based transaction body to Promise inside this callback. This is
the only place in business logic where `Effect.runPromise` is allowed.

### Phase 3: Application Use-Cases

#### 8. Convert all use-cases to Effect.gen

Each use-case currently returns `Promise<Result<T, DomainError>>`. Convert
to `Effect<T, DomainError, R>`.

**Pattern:**

Current:
```typescript
export async function searchChunks(
  query: string,
  opts: { limit?: number },
  deps: SearchDeps,
): Promise<Result<RetrievedChunk[], DomainError>> {
  let embedding: number[];
  try {
    embedding = await deps.embeddings.embed(query);
  } catch (cause) {
    return err(new ExternalServiceError('Embedding API failed', cause));
  }
  // ...
  return ok(chunks);
}
```

New:
```typescript
export const searchChunks = Effect.fn("Search.searchChunks")(
  (query: string, opts: { limit?: number }) => Effect.gen(function* () {
    const embeddings = yield* Embeddings;
    const chunks = yield* Chunks;

    const embedding = yield* Effect.tryPromise({
      try: () => embeddings.embed(query),
      catch: (error) => new ExternalServiceError('Embedding API failed', error),
    });

    const results = yield* Effect.tryPromise({
      try: () => chunks.searchByVector(embedding, {
        threshold: opts.threshold ?? SIMILARITY_THRESHOLD,
        limit: opts.limit ?? DEFAULT_SEARCH_LIMIT,
      }),
      catch: (error) => new ExternalServiceError('Chunk search failed', error),
    });

    return results.map((r) => ({
      content: r.content,
      similarity: r.similarity,
    }));
  })
);
```

**Key changes:**
- Remove `deps` parameter — services come from `Context`
- Remove try/catch — use `Effect.tryPromise` with `catch` mapping
- Remove `ok()`/`err()` — return values are successes, `Effect.fail` for errors
- Use `Effect.fn` for named functions with tracing
- Use `Effect.gen` for composition

#### 9. Convert all use-case files

Files to convert:
- `packages/application/src/rag/ingest.ts`
- `packages/application/src/rag/search.ts`
- `packages/application/src/admin/documents.ts`
- `packages/application/src/admin/tickets.ts`
- `packages/application/src/admin/analytics.ts`
- `packages/application/src/admin/list-audit.ts`
- `packages/application/src/auth/users.ts`
- `packages/application/src/auth/rate-limit.ts`
- `packages/application/src/auth/query-stats.ts`
- `packages/application/src/auth/audit.ts`
- `packages/application/src/prompt/build-system-prompt.ts` (may stay pure)

#### 10. Delete `packages/application/src/service-result.ts`

The `wrapServiceCall`, `serviceResult`, and `sanitizePagination` utilities
are no longer needed. Use-cases now use `Effect.tryPromise` directly.

`sanitizePagination` logic can be inlined or moved to a utility in the
app shell if still needed by route handlers.

#### 11. Update `packages/application/src/index.ts`

Remove service-result exports. Update barrel exports to match new file
structure.

#### 12. Update `src/composition.ts`

Replace the `bind()` pattern with Layer assembly:

```typescript
import { Layer, Effect } from "effect";

// Assemble all layers
const appLayer = Layer.mergeAll(
  DocumentsLayer,
  ChunksLayer,
  TicketsLayer,
  UsersLayer,
  AuditLayer,
  EmbeddingsLayer,
  ChatModelLayer,
  BlobStorageLayer,
  IngestQueueLayer,
  PdfParserLayer,
  TextSplitterLayer,
  RateLimiterLayer,
  QueryStatsLayer,
  TransactionRunnerLayer,
  ClockLive,
  HasherLive,
  SessionStoreLayer,
);

// Provide to use-cases at the entry point
export function runWithLayer<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(appLayer)));
}
```

#### 13. Update route handlers

Each route currently does:
```typescript
const result = await comp.someUseCase(args);
if (!result.ok) return respond(result.error);
return Response.json(result.value);
```

New pattern:
```typescript
import { Effect } from "effect";

export async function GET(req: Request) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const { listDocuments } = yield* Documents;
      // ... parse query params, auth check ...
      const result = yield* listDocuments(opts);
      return Response.json(result);
    }).pipe(
      Effect.catchTags({
        NotFoundError: () => Effect.succeed(notFoundResponse()),
        ExternalServiceError: () => Effect.succeed(serviceUnavailableResponse()),
      }),
      Effect.provide(appLayer),
    )
  );
}
```

#### 14. Update server actions

Same pattern as routes — `Effect.runPromise` at the boundary.

#### 15. Update tests (minimal — keep tests passing, NOT full migration)

Tests currently use `ok()`, `err()`, and check `result.ok`. In this
session, make the **minimal changes** needed to keep all tests passing
with the new Effect types. **Do NOT convert tests to `@effect/vitest`
yet** — that is Session 07's job.

**Minimal test changes in this session:**
- Replace `import { ok, err } from '@app/domain'` with `import { Effect } from 'effect'`
- Replace `const result = await useCase(args)` with `const exit = await Effect.runPromiseExit(useCase(args).pipe(Effect.provide(testLayer)))`
- Replace `expect(result.ok).toBe(false)` with `expect(exit._tag).toBe('Failure')`
- Replace `expect(result.error).toBeInstanceOf(NotFoundError)` with `expect((exit as any).cause.error._tag).toBe('NotFoundError')`
- Replace `expect(result.value).toEqual(expected)` with `expect((exit as any).value).toEqual(expected)`
- Remove `result.test.ts` tests for `ok`/`err`/`map`/`flatMap` — but add equivalent tests elsewhere (e.g., in a use-case test, verify `Effect.gen` composition works the same way)

**Test pattern for this session:**
```typescript
import { Effect } from "effect";
import { describe, it, expect } from "vitest"; // keep plain vitest for now

it("searchChunks returns error on embedding failure", async () => {
  const program = searchChunks("test", { limit: 3 });
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(testLayer))
  );
  expect(exit._tag).toBe("Failure");
  // ... check error
});
```

**Important:** Session 07 will convert these to `it.effect` with
`@effect/vitest`. In this session, just keep tests passing with plain
vitest and `Effect.runPromiseExit`/`Effect.runPromise`.

---

## Env Vars

No new env vars. No existing env vars changed.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

- `packages/domain/src/services.ts` — new file, Context.Service definitions
- `packages/domain/src/ports.ts` — deleted
- `packages/domain/src/result.ts` — deleted
- `packages/domain/src/index.ts` — updated exports
- `packages/infrastructure/src/db/repositories.ts` — all functions return Effect
- `packages/infrastructure/src/db/services.ts` — new file, live layers
- All application use-case files — rewritten to Effect.gen
- `packages/application/src/service-result.ts` — deleted
- `packages/application/src/index.ts` — updated exports
- `src/composition.ts` — rewritten as layer assembly
- All API routes — updated to Effect.runPromise boundaries
- All server actions — updated to Effect.runPromise
- All tests — updated to use Effect types
- `src/lib/http.ts` — updated for Effect error handling

---

## Gotchas / Things to Watch Out For

1. **`Effect.gen` requires `yield*`**: Every service access needs
   `const service = yield* ServiceName`. This is verbose but explicit.

2. **`Effect.tryPromise` catch mapping**: The `catch` function receives
   `unknown` — you must type-narrow or wrap in a domain error.

3. **Transaction isolation**: The `TransactionRunner.run` method must
   execute the callback inside `db.transaction`. The Effect inside the
   transaction must be converted to Promise via `Effect.runPromise`
   inside the transaction callback.

4. **Layer memoization**: Effect automatically memoizes layers by
   reference. Don't create the same layer twice — store in a constant.

5. **`Effect.runPromise` at boundaries only**: Never call `Effect.runPromise`
   inside business logic. Only at route handlers, server actions, and
   scripts.

6. **Service dependency graph**: If service A depends on service B, A's
   layer must `Layer.provide` B's layer, or B must be in the merged
   layer. Effect resolves dependencies automatically at composition time.

---

## Validation

```bash
pnpm typecheck    # tsc — must pass (lots of type changes)
pnpm lint         # eslint — must pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass
pnpm build        # Next.js build — must succeed (routes changed types)
```

This session is the most likely to have type errors. Fix them methodically —
start with the domain layer, then infrastructure, then application, then
app shell. Run `pnpm build` as well — if Next.js build fails, it means a
route handler's return type changed in an incompatible way.

---

## Git Commit Strategy

```bash
git add -A
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-03): replace Result with Effect, ports with Context.Service

The big migration: remove Result<T,E> union type, use Effect<A,E,R>
everywhere. Replace port interfaces with Context.Service definitions.
Convert all repository implementations to Effect (Effect.tryPromise).
Convert all application use-cases to Effect.gen workflows. Update
composition.ts to layer assembly. Update routes to Effect.runPromise
boundaries. Remove service-result.ts.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

---

## Handoff Instructions

Write `docs/effect-migration/context/after-session-03.md`. Include:

1. **Confirm Result removed**: no more `Result<T,E>` in the codebase.
2. **List all Context.Service definitions**: from services.ts
3. **List all live layers created**: from infrastructure
4. **Confirm transaction runner**: how transactions work now
5. **Note any test changes**: test count, test framework used
6. **Tell the next agent**: "The entire type system is now Effect-based.
   All services are Context.Service. All use-cases are Effect.gen.
   Session 4 will convert the remaining infrastructure services (LLM,
   auth, blob storage, etc.) to proper Effect layers."

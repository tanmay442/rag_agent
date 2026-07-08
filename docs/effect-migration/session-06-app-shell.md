# Session 06: App Shell — Composition, Routes, Actions, HTTP

## Objective

Rewrite `src/composition.ts` as full layer assembly. Convert all API routes
to `Effect.runPromise` boundaries with `Effect.catchTag` error mapping.
Convert server actions. Update `src/lib/http.ts` for Effect error handling.
Chat streaming route with Effect orchestration.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-05.md` first.

Key things to know:
- All use-cases are Effect.gen with Effect.fn tracing
- All infrastructure services are Effect layers
- `composition.ts` was updated in Session 3 but needs refinement
- Routes were updated to Effect.runPromise in Session 3 but need error mapping

---

## Implementation

### Phase 1: Composition Layer Assembly

#### 1. Rewrite `src/composition.ts`

The composition file should be a clean layer assembly with no business
logic:

```typescript
import { Layer, Effect } from "effect";
import { Documents, Chunks, Tickets, Users, Audit, RateLimiter, QueryStats, Embeddings, ChatModel, BlobStorage, IngestQueue, PdfParser, TextSplitter, TransactionRunner, Clock, Hasher, SessionStore } from "@app/domain";
import { DocumentsLive, ChunksLive, TicketsLive, UsersLive, AuditLive, TransactionRunnerLive, DbClientLive } from "@app/infrastructure/Db";
import { EmbeddingsLive, ChatModelLive } from "@app/infrastructure/Llm";
import { RateLimiterLive, QueryStatsLive, SessionStoreLive } from "@app/infrastructure/Auth";
import { BlobStorageLive } from "@app/infrastructure/Storage";
import { IngestQueueLive } from "@app/infrastructure/Queue";
import { PdfParserLive, TextSplitterLive } from "@app/infrastructure/Pdf";
import { ClockLive, HasherLive, AppConfigLive } from "@app/infrastructure";

// Compose all live layers
export const appLayer = Layer.mergeAll(
  DbClientLive,
  DocumentsLive,
  ChunksLive,
  TicketsLive,
  UsersLive,
  AuditLive,
  EmbeddingsLive,
  ChatModelLive,
  RateLimiterLive,
  QueryStatsLive,
  BlobStorageLive,
  IngestQueueLive,
  PdfParserLive,
  TextSplitterLive,
  TransactionRunnerLive,
  ClockLive,
  HasherLive,
  SessionStoreLive,
  AppConfigLive,
);

/** Run an Effect program with all services provided.
 *  Used by route handlers and server actions. */
export function runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(appLayer)));
}
```

#### 2. Remove old composition patterns

Delete:
- `bind()` helper function
- `createComposition()` factory
- `getComposition()` singleton
- All the manual wiring (ingestDeps, searchDeps, etc.)
- `parseQueryPagination()` — move to a utility if still needed

#### 3. Update route helper functions

The `requireAdminRoute`, `requireAdminGet`, `requireAdminDocument`
helpers should return `Effect` so they can be composed inside route
handler Effect pipelines. **Do not** write them as async functions
with `yield*` outside a generator — that is invalid TypeScript.

```typescript
import { Effect } from "effect";
import { UnauthorizedError, ForbiddenError } from "@app/domain";
import { SessionStore, type AppSessionFull } from "@app/domain";

/** Require an admin session. Returns the session or fails with
 *  UnauthorizedError / ForbiddenError. Compose inside Effect.gen. */
export function requireAdminEffect(): Effect.Effect<AppSessionFull, UnauthorizedError | ForbiddenError, SessionStore> {
  return Effect.gen(function* () {
    const sessionStore = yield* SessionStore;
    const session = yield* sessionStore.getSession();
    if (!session) return yield* Effect.fail(new UnauthorizedError());
    if (session.user.role !== 'admin') return yield* Effect.fail(new ForbiddenError());
    return session;
  });
}

/** Require a signed-in session (any role). */
export function requireSessionEffect(): Effect.Effect<AppSessionFull, UnauthorizedError, SessionStore> {
  return Effect.gen(function* () {
    const sessionStore = yield* SessionStore;
    const session = yield* sessionStore.getSession();
    if (!session) return yield* Effect.fail(new UnauthorizedError());
    return session;
  });
}
```

The old `requireAdminRoute`/`requireAdminGet`/`requireAdminDocument`
functions that returned `{ ok: true | false, ... }` unions are removed.
Routes now compose `requireAdminEffect()` inside `Effect.gen` and rely
on `Effect.catchTags` at the route boundary to map errors to HTTP
responses.

### Phase 2: Route Handlers

#### 4. Convert all API routes to Effect.runPromise with error mapping

Every route follows this pattern:

```typescript
import { Effect } from "effect";
import { runEffect } from "@/composition";

export async function GET(req: Request) {
  return runEffect(
    Effect.gen(function* () {
      const documents = yield* Documents;
      // ... parse query, call service
      const result = yield* documents.list(opts);
      return Response.json(result);
    }).pipe(
      Effect.catchTags({
        NotFoundError: () => Effect.succeed(notFoundResponse()),
        ValidationError: (e) => Effect.succeed(badRequestResponse(e.message)),
        ExternalServiceError: () => Effect.succeed(serviceUnavailableResponse()),
      })
    )
  );
}
```

#### 5. Convert specific routes

Routes to convert (each in `src/app/api/admin/`):
- `users/route.ts` — GET list users
- `users/[clerkId]/role/route.ts` — POST set role
- `tickets/route.ts` — GET list tickets
- `tickets/[ticketId]/route.ts` — PATCH update ticket
- `documents/[id]/route.ts` — DELETE soft-delete
- `documents/[id]/restore/route.ts` — POST restore
- `documents/[id]/blob/route.ts` — GET blob preview
- `documents/[id]/download/route.ts` — GET download
- `audit/route.ts` — GET list audit
- `analytics/summary/route.ts` — GET analytics summary
- `ingest-worker/route.ts` — POST QStash callback
- `chat/route.ts` — POST chat (streaming)

#### 6. Chat streaming route

The chat route is the most complex due to streaming. Keep the AI SDK
streaming logic but wrap the orchestration in Effect:

```typescript
export async function POST(req: Request) {
  return runEffect(
    Effect.gen(function* () {
      const sessionStore = yield* SessionStore;
      const rateLimiter = yield* RateLimiter;
      // ... auth, rate limit, parse
      const embeddings = yield* Embeddings;
      const chunks = yield* Chunks;
      // ... search, build tools
      const result = streamText({ ... });
      const stream = result.toUIMessageStream({ originalMessages: messages });
      // ... citation stream logic
      return createUIMessageStreamResponse({ stream: citationStream });
    }).pipe(
      Effect.catchTags({
        UnauthorizedError: () => Effect.succeed(unauthorizedResponse()),
        RateLimitedError: (e) => Effect.succeed(rateLimitedResponse(e)),
      })
    )
  );
}
```

### Phase 3: Server Actions

#### 7. Convert `src/app/(app)/admin/actions.ts`

Each action becomes an Effect program. **Important:** `revalidatePath` is
a Next.js server function that must be called **after** the Effect
completes successfully — not inside `Effect.gen`. Call it in the `.then`
handler of `runEffect`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { Effect } from "effect";
import { runEffect, requireAdminEffect } from "@/composition";

export async function uploadPdfAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const result = await runEffect(
    Effect.gen(function* () {
      const session = yield* requireAdminEffect();
      // ... parse formData, call uploadPdf use-case
      return { status: result.status, chunks: result.chunks, fileName: file.name, documentId: result.documentId };
    }).pipe(
      Effect.catchTags({
        UnauthorizedError: () => Effect.succeed({ error: 'Unauthorized' }),
        ForbiddenError: () => Effect.succeed({ error: 'Forbidden' }),
        ValidationError: (e) => Effect.succeed({ error: e.message, code: 'validation_error' }),
        ExternalServiceError: () => Effect.succeed({ error: 'An error occurred' }),
      }),
      Effect.catchAll(() => Effect.succeed({ error: 'An unexpected error occurred' })),
    )
  );

  // Call revalidatePath AFTER the Effect completes, only on success
  if (!('error' in result)) {
    revalidatePath('/admin');
    revalidatePath('/admin/upload');
    revalidatePath('/admin/documents');
  }

  return result;
}
```

**Pattern for all actions:**
1. Run the Effect program with `runEffect`
2. `await` the result
3. If successful (no `error` key), call `revalidatePath` for affected paths
4. Return the result object

### Phase 4: HTTP Helpers

#### 8. Update `src/lib/http.ts`

The `respond()` function should handle both old-style errors and Effect
errors. Since we're now fully Effect-based, simplify to handle `_tag`
discriminated errors:

```typescript
export function respond(error: unknown): Response {
  // Handle Effect Schema.TaggedError
  if (error && typeof error === 'object' && '_tag' in error) {
    const tag = (error as { _tag: string })._tag;
    return tagToResponse(tag, error);
  }
  // Handle Response passthrough
  if (error instanceof Response) return error;
  // Generic fallback
  return Response.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 });
}

export function respondResult<T>(result: Effect.Effect<T, never, never>): Response {
  // This function may no longer be needed — routes handle effects directly
}
```

#### 9. Update `src/lib/__tests__/http.test.ts`

Update tests to use the new error types and `_tag` checks.

---

## Env Vars

No new env vars.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

- `src/composition.ts` — rewritten as layer assembly with `runEffect`
- All API route files — rewritten with Effect.gen + Effect.catchTags
- `src/app/(app)/admin/actions.ts` — rewritten with Effect
- `src/lib/http.ts` — simplified for Effect errors
- `src/lib/__tests__/http.test.ts` — updated

---

## Gotchas / Things to Watch Out For

1. **`runEffect` is the only `Effect.runPromise` call site**: All other
   Effect execution should be inside `Effect.gen` pipelines. Only route
   handlers and server actions call `runEffect`.

2. **Error mapping at boundaries**: Every route/action must catch all
   possible error types. Use `Effect.catchTags` for known errors and
   `Effect.catchAll` for unknown errors.

3. **Streaming routes**: The chat route creates a ReadableStream. The
   stream itself is not an Effect — it's a Web API. Wrap the
   orchestration in Effect but return the stream directly.

4. **Middleware stays as-is**: `src/proxy.ts` uses Clerk middleware in
   edge runtime. Don't convert it to Effect.

5. **`revalidatePath` in actions**: `revalidatePath` is a Next.js server
   function — call it **after** `runEffect` completes and returns a
   success result. Do NOT call it inside `Effect.gen`. See the action
   pattern in section 7 above.

---

## Validation

```bash
pnpm typecheck    # tsc — must pass
pnpm lint         # eslint — must pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass
pnpm build        # Next.js build — must succeed (routes + composition rewritten)
```

This session rewrites all routes and composition. `pnpm build` is
especially important here — Next.js may fail to build if route return
types are incompatible. If build fails, check that route handlers
return `Promise<Response>` and that `runEffect` is typed correctly.

---

## Git Commit Strategy

```bash
git add -A
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-06): rewrite composition as layers, convert routes and actions

Rewrite composition.ts as clean layer assembly with runEffect helper.
Convert all API routes to Effect.gen with Effect.catchTag error mapping.
Convert server actions to Effect. Update http.ts for Effect errors.
Middleware stays as-is (edge runtime).

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

---

## Handoff Instructions

Write `docs/effect-migration/context/after-session-06.md`. Include:

1. **Confirm composition.ts rewritten**: no more bind(), no manual DI
2. **List all routes converted**: with their error catch patterns
3. **Confirm server actions converted**
4. **Confirm all 230 tests pass**
5. **Tell the next agent**: "The app shell is fully Effect-based.
   Session 7 will convert all 26 test files to @effect/vitest."

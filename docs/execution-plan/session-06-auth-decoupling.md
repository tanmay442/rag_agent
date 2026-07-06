# Session 06: Auth Decoupling — Clerk Behind `SessionStore` Port

## Objective

Move Clerk auth behind the existing `SessionStore` port so that
`src/proxy.ts` and `session.ts` no longer hard-import Clerk at the top
level. Introduce an `AUTH_PROVIDER` env var and a factory that
dispatches to the Clerk adapter. No second auth adapter (e.g., Auth.js)
is implemented in this session — the goal is to create the seam so a
second adapter can be added later without touching route code.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-05.md` first. The
Upstash rate limiter + query stats from Session 5 should be complete.
Key things to know:

- `RateLimiter.check` and `QueryStats.record`/`top` are now async.
- The composition root selects Upstash or in-memory adapters based on
  env.

### Files to Read First

- `src/proxy.ts` — current Clerk middleware (imports
  `clerkMiddleware`, `clerkClient`, `createRouteMatcher` from
  `@clerk/nextjs/server`)
- `packages/infrastructure/src/auth/session.ts` — `getAppSession`,
  `requireAdmin`, `requireSession` (all import from `@clerk/nextjs/server`)
- `packages/infrastructure/src/auth/clerk-session.ts` —
  `clerkSessionStore`, `clerkClient`
- `packages/infrastructure/src/auth/index.ts` — current exports
- `packages/domain/src/ports.ts` — `SessionStore` port (line 226)
- `src/composition.ts` — re-exports `requireAdmin`, `requireSession`,
  `getAppSession` (line 99)
- `src/proxy.test.ts` — middleware route gating tests

---

## Implementation

### 1. Create `packages/infrastructure/src/auth/auth-factory.ts`

A factory that returns the auth middleware + session functions based on
`AUTH_PROVIDER`:

```typescript
import type { NextRequest, NextResponse } from 'next/server';

export interface AuthMiddleware {
  (req: NextRequest): Promise<NextResponse>;
}

export interface AuthAdapter {
  middleware: AuthMiddleware;
  getAppSession: () => Promise<AppSessionFull | null>;
  requireAdmin: () => Promise<AppSessionFull>;
  requireSession: () => Promise<AppSessionFull>;
  clerkClient?: () => Promise<...>;  // Clerk-specific, optional
}

export function createAuthAdapter(): AuthAdapter {
  const provider = process.env.AUTH_PROVIDER ?? 'clerk';
  switch (provider) {
    case 'clerk':
      return createClerkAdapter();
    default:
      throw new Error(`Unknown AUTH_PROVIDER: ${provider}`);
  }
}
```

### 2. Create `packages/infrastructure/src/auth/clerk-adapter.ts`

Move the Clerk-specific logic from `session.ts` and `proxy.ts` into a
single adapter file. This is a move + restructure, not a rewrite — all
Clerk behavior stays identical:

```typescript
import { auth, currentUser } from '@clerk/nextjs/server';
import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
// ... all the current logic from session.ts + proxy.ts
```

The adapter exports:
- `middleware` — the current `clerkMiddleware(async (auth, req) => { ... })`
  body from `proxy.ts`
- `getAppSession` — the current `getAppSession` from `session.ts`
- `requireAdmin` — the current `requireAdmin` from `session.ts`
- `requireSession` — the current `requireSession` from `session.ts`
- `clerkClient` — re-exported for `syncClerkRole` in repositories.ts

### 3. Rename `packages/infrastructure/src/auth/session.ts`

Rename to `clerk-session-impl.ts` (or fold its contents into
`clerk-adapter.ts`). The goal is to make it clear this is
Clerk-specific code, not generic session code. If you fold it into
`clerk-adapter.ts`, delete `session.ts`.

### 4. Rewrite `src/proxy.ts`

Replace the direct Clerk imports with a dispatch via the factory:

```typescript
import { createAuthAdapter } from '@app/infrastructure/auth/auth-factory';

const adapter = createAuthAdapter();

export default adapter.middleware;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

The route matchers (`isPublicRoute`, `isProtectedRoute`, `isAdminRoute`)
and the `resolveRole` function move into `clerk-adapter.ts` as
internals of the Clerk middleware. The `config.matcher` stays in
`proxy.ts` because Next.js requires it to be exported from the
middleware file.

### 5. Update `packages/infrastructure/src/auth/index.ts`

```typescript
export { createAuthAdapter, type AuthAdapter } from './auth-factory';
export { clerkSessionStore, clerkClient } from './clerk-session';
export { lruRateLimiter } from './lru-rate-limiter';
export { inMemoryQueryStats } from './in-memory-query-stats';
export { createUpstashRateLimiter } from './upstash-rate-limiter';
export { createUpstashQueryStats } from './upstash-query-stats';
export type { AppSessionFull, AppRole } from './clerk-adapter';
```

Remove the direct `getAppSession`, `requireAdmin`, `requireSession`
exports — those now come from the adapter factory.

### 6. Update `src/composition.ts`

Change the auth re-exports:

```typescript
// Was: export { requireAdmin, requireSession, getAppSession, ... } from '@app/infrastructure/auth';
const authAdapter = Auth.createAuthAdapter();

export const requireAdmin = authAdapter.requireAdmin;
export const requireSession = authAdapter.requireSession;
export const getAppSession = authAdapter.getAppSession;
```

The `session: Auth.clerkSessionStore` in `createComposition()` stays —
it's the `SessionStore` port implementation for Clerk.

### 7. Update `packages/infrastructure/src/db/repositories.ts`

The `syncClerkRole` function (line 307) imports `clerkClient` from
`../auth/clerk-session`. This import path stays valid (the file is
renamed but the export is re-exported from `auth/index.ts`). If you
folded `session.ts` into `clerk-adapter.ts`, update the import path.

### 8. Update `src/proxy.test.ts`

The test mocks `clerkMiddleware`. Update it to mock the auth adapter
factory instead. The test should verify:
- Public routes pass through
- Protected routes redirect to sign-in when not authenticated
- Admin routes redirect to `/chat` when authenticated but not admin
- API routes return 401 when not authenticated

The test structure stays the same — just the mock target changes.

### 9. Update `src/app/(app)/admin/actions.test.ts`

The test mocks `requireAdmin` from `@/composition`. This still works
because `composition.ts` re-exports `requireAdmin` from the adapter.
No change needed unless the mock path changes.

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| `AUTH_PROVIDER` | no | `clerk` | Only `clerk` supported. Seam for future `authjs`. |

No new env vars. Existing Clerk env vars unchanged:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, etc.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

New files:
- `packages/infrastructure/src/auth/auth-factory.ts`
- `packages/infrastructure/src/auth/clerk-adapter.ts`

Renamed/modified:
- `packages/infrastructure/src/auth/session.ts` → renamed or folded
  into `clerk-adapter.ts`
- `packages/infrastructure/src/auth/index.ts` — updated exports
- `src/proxy.ts` — dispatches via factory instead of direct Clerk
  imports
- `src/composition.ts` — uses adapter factory for auth functions
- `src/proxy.test.ts` — mock target updated

---

## Gotchas / Things to Watch Out For

1. **`proxy.ts` must export a default function and a `config` object**:
   Next.js requires the middleware file to export these. The
   `config.matcher` must stay in `proxy.ts`, not in the adapter. The
   adapter returns the middleware function, and `proxy.ts` re-exports
   it as default.

2. **`clerkMiddleware` is not a plain function**: It's a higher-order
   function that wraps the Next.js middleware. The adapter must return
   the result of `clerkMiddleware(async (auth, req) => { ... })`, not
   a plain `async (req) => { ... }`. Verify that the exported default
   from `proxy.ts` still works with Next.js's middleware system.

3. **Clerk JWT template**: The `resolveRole` function reads
   `sessionClaims.metadata.role` from the JWT. This is Clerk-specific
   and stays inside `clerk-adapter.ts`. A future Auth.js adapter would
   read roles from the DB instead.

4. **`repositories.ts` imports `clerkClient`**: The `syncClerkRole`
   function (line 307-313) dynamically imports `clerkClient` from
   `../auth/clerk-session`. If you rename or fold this file, update
   the import path. Use a barrel re-export from `auth/index.ts` to
   avoid breakage: `import { clerkClient } from '../auth'`.

5. **`auth()` and `currentUser()` from `@clerk/nextjs/server`**: These
   are Clerk-specific functions that read from the request context.
   They must stay in `clerk-adapter.ts`, not in the factory or the
   port. The port (`SessionStore.getSession`) abstracts this, but the
   adapter implementation uses Clerk's functions internally.

6. **Behavior must be identical**: This session is a refactor, not a
   behavior change. After this session:
   - Sign-in / sign-up works the same
   - Route gating works the same (public / protected / admin)
   - `requireAdmin` / `requireSession` work the same
   - `getAppSession` works the same
   - Role sync to Clerk works the same

   If any behavior changes, something went wrong.

7. **Edge runtime**: `clerkMiddleware` is Edge-compatible. The factory
   must not break Edge compatibility. Avoid importing Node-only
   modules in the factory or adapter.

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run — all tests must pass
pnpm arch         # dependency-cruiser
```

After validation, test the auth flow locally:
```bash
pnpm dev
# Visit / → should load (public)
# Visit /chat → should redirect to /sign-in (protected, not signed in)
# Visit /admin → should redirect to /sign-in (protected, not signed in)
# Visit /api/chat → should return 401 (protected API, not signed in)

# Sign in via Clerk
# Visit /chat → should load
# Visit /admin → should redirect to /chat if not admin, or load if admin
# Use /api/chat → should work
```

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-06): decouple Clerk auth behind SessionStore port

Move Clerk middleware and session logic into clerk-adapter behind
an auth-factory dispatched by AUTH_PROVIDER env var. proxy.ts
delegates to the factory. Behavior unchanged. Seam ready for a
future Auth.js adapter.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-06.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

Write `docs/execution-plan/context/after-session-06.md`. Include:

1. **The adapter factory**: how `createAuthAdapter()` works, where it
   lives, what it returns.
2. **The `AUTH_PROVIDER` env var**: default `clerk`, only supported
   value. Seam for future `authjs`.
3. **What moved where**: `session.ts` → `clerk-adapter.ts`, `proxy.ts`
   logic → `clerk-adapter.ts` middleware.
4. **Confirm behavior is identical**: sign-in, route gating, admin
   checks, role sync — all unchanged.
5. **Tell the next agent**: "Auth is now behind an adapter factory
   dispatched by `AUTH_PROVIDER`. Currently only `clerk` is
   implemented. `src/proxy.ts` exports `adapter.middleware` as
   default. The `requireAdmin`/`requireSession`/`getAppSession`
   functions come from the adapter via the composition root. Read
   `packages/infrastructure/src/auth/auth-factory.ts` and
   `clerk-adapter.ts` for the wiring. A future `authjs` adapter would
   be a new file + one case in the switch."

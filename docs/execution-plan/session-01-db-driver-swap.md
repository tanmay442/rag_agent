# Session 01: DB Driver Swap — `pg` Pool → Neon Serverless

## Objective

Replace the `node-postgres` (`pg`) connection pool with
`@neondatabase/serverless` (WebSocket-based, connectionless from the
function's perspective). Delete the unconditional `sslmode=verify-full`
injection that breaks local Docker Postgres. This makes the app
serverless-correct: no pool exhaustion under Vercel fan-out, no TCP+TLS
cold-start tax, Edge-runtime compatible.

This is the foundational session — every subsequent session depends on
it.

---

## Dev Environment Check

Run these before starting. If any fail, stop and inform the developer.

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean (no uncommitted changes)
```

No additional tools needed for this session.

---

## Context from Prior Sessions

This is the first session. There is no prior context. Read the current
codebase state to understand the existing DB layer before making
changes.

### Files to Read First

- `packages/infrastructure/src/db/pool.ts` — current pool construction
  + `sslmode` injection + missing-DB stub
- `packages/infrastructure/src/db/client.ts` — drizzle client wiring
- `packages/infrastructure/src/db/repositories.ts` — uses `db` and
  `db.transaction`; verify the new driver supports the same API
- `drizzle.config.ts` — reads `DATABASE_URL`, no change needed
- `package.json` — current deps (`pg`, `@types/pg` to remove)

---

## Implementation

### 1. Update `package.json` dependencies

Remove:
- `pg` (from `dependencies`)
- `@types/pg` (from `devDependencies`)

Add:
- `@neondatabase/serverless` (to `dependencies`)

Run `pnpm install` after editing `package.json`.

### 2. Rewrite `packages/infrastructure/src/db/pool.ts`

Replace the entire file. The new version:

- Imports `Pool` from `@neondatabase/serverless` (not `pg`).
- Reads `process.env.DATABASE_URL`.
- If `DATABASE_URL` is unset, returns a stub pool (keep the existing
  `makeMissingDatabasePool` pattern — the app should still boot for env
  validation even without a DB connection string).
- **Does NOT inject `sslmode=verify-full`**. Neon URLs already carry
  the right SSL params. Local Docker uses plain `postgres://` with no
  SSL. The caller's `DATABASE_URL` is trusted as-is.
- Constructs the neon Pool with: `webSocketConstructor: undefined`
  (uses default), `max: 20`, `idleTimeoutMillis: 20`,
  `connectionTimeoutMillis: 10_000`.

```typescript
import 'dotenv/config';
import { Pool as NeonPool } from '@neondatabase/serverless';

export function buildPool(): NeonPool {
  const connectionString = process.env.DATABASE_URL ?? '';
  if (!connectionString) {
    return makeMissingDatabasePool();
  }
  return new NeonPool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 20,
    connectionTimeoutMillis: 10_000,
  });
}
```

Keep `makeMissingDatabasePool` but update its return type to
`NeonPool` (cast through `unknown` as the current code does).

### 3. Rewrite `packages/infrastructure/src/db/client.ts`

Switch from `drizzle-orm/node-postgres` to
`drizzle-orm/neon-serverless`:

```typescript
import { drizzle } from 'drizzle-orm/neon-serverless';
import { buildPool } from './pool';
import * as schema from './schema';

export { schema };
export const db = drizzle(buildPool(), { schema });
```

The `db` object exposes the same API (`.query`, `.select`, `.insert`,
`.update`, `.delete`, `.execute`, `.transaction`) — the repository
layer needs no changes.

### 4. Verify `packages/infrastructure/src/db/repositories.ts`

No code changes needed. Verify that:
- `Client` type (`typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]`)
  still compiles.
- `searchChunksByVector`'s raw `sql` template with `::vector` cast
  (around line 71-77) still works — drizzle passes raw SQL through
  regardless of driver.
- `db.transaction(async (tx) => { ... })` (line 460-472) still works
  with the neon-serverless driver. It does — neon-serverless supports
  interactive transactions via WebSocket.

### 5. Verify `drizzle.config.ts`

No changes needed. `dialect: 'postgresql'` and
`dbCredentials.url: process.env.DATABASE_URL` are driver-agnostic.

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| `DATABASE_URL` | yes | — | Neon connection string (prod) or `postgres://postgres:postgres@localhost:5432/ragagent` (local Docker, added in Session 8) |

No new env vars introduced. The `sslmode` behavior changes (no longer
injected) but no env var controls it.

---

## Schema / Migration Changes

None. The schema is untouched.

---

## What Changed in the Codebase Structure

- `packages/infrastructure/src/db/pool.ts` — rewritten (neon pool, no
  sslmode injection)
- `packages/infrastructure/src/db/client.ts` — drizzle import changed
  to `neon-serverless`
- `package.json` — `pg` and `@types/pg` removed; `@neondatabase/serverless` added

---

## Gotchas / Things to Watch Out For

1. **Neon WebSocket in Node.js**: The neon-serverless driver uses
   `WebSocket` which is available in Node 20+ and Edge runtime. If you
   see a `WebSocket is not defined` error in tests, add a polyfill or
   ensure the test environment provides it. Vitest's `jsdom` environment
   (used in some tests) provides it. For pure Node tests, Node 20+ has
   a global `WebSocket`.

2. **`db.transaction` over WebSocket**: Neon's serverless driver
   supports interactive transactions, but each statement is a separate
   HTTP/WebSocket round-trip. For the `insertChunks` batch (500 rows
   per insert), this is fine — it's already batched. No code change
   needed, just be aware latency is slightly higher per statement than
   a raw TCP connection.

3. **Tests mock `db`**: The existing 192 tests mock the repository
   layer or the `db` object, so the driver swap should be invisible to
   them. If any test imports `pg` directly, update it to not depend on
   the driver. Search for `from 'pg'` or `require('pg')` in test files.

4. **`vitest.shims/`**: Check if there are shims for `pg` that need
   updating. Look at the `vitest.shims/` directory and
   `vitest.setup.ts`.

---

## Validation

Run all four checks. All must pass before completing the session.

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run — all 192+ tests must pass
pnpm arch         # dependency-cruiser — architecture boundaries must hold
```

If `pnpm test` fails due to a `WebSocket` issue, check:
- `vitest.setup.ts` — may need to add a `WebSocket` polyfill for the
  test environment.
- `vitest.shims/` — existing shims directory, may need updating.

If `pnpm arch` fails, it means a new import was introduced that
violates the layer rules. The `@neondatabase/serverless` import is in
`packages/infrastructure` which is allowed to import external libs. It
should not trigger a violation.

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-01): swap pg Pool for @neondatabase/serverless

Replace node-postgres with Neon serverless driver for
connectionless HTTP fetch. Remove unconditional sslmode injection.
Edge-runtime compatible, no pool exhaustion under fan-out.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

**Also add to `.gitignore`** (Session 1 only):
```
docs/execution-plan/context/
```

Do NOT stage `docs/execution-plan/context/after-session-01.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

When you complete this session, write
`docs/execution-plan/context/after-session-01.md` following the format
in `00-handoff-protocol.md`. Include:

1. **Confirm the driver works**: Did `pnpm test` pass with the neon
   driver? Were any test shims updated?
2. **List the exact dependency changes**: what was removed, what was
   added, with versions.
3. **Note any WebSocket/polyfill changes**: if you had to update
   `vitest.setup.ts` or add a shim, the next agent needs to know.
4. **Confirm `db.transaction` still works**: this is critical for
   Sessions 3 and 4 which rely on transactions. If you hit any issue,
   document the workaround.
5. **Tell the next agent**: "The DB driver is now
   `@neondatabase/serverless`. The `sslmode` injection is gone. Local
   Docker Postgres will work with a plain `postgres://` URL (added in
   Session 8). The `db.transaction()` API is preserved. Read
   `packages/infrastructure/src/db/pool.ts` and `client.ts` to see the
   new wiring."

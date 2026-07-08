# Session 01: Foundation — Dependencies, Architecture Rules, Branded IDs

## Objective

Set up the Effect tooling foundation: install packages, update architecture
rules, and define branded ID types. No business logic changes — this session
is purely infrastructure setup that unblocks all subsequent sessions.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

This is the first session. There is no prior context.

### Files to Read First

- `packages/domain/src/errors.ts` — current error classes
- `packages/domain/src/result.ts` — current Result type
- `packages/domain/src/ports.ts` — current port interfaces
- `packages/domain/src/index.ts` — domain barrel exports
- `.dependency-cruiser.cjs` — current architecture rules
- `vitest.config.ts` — current test config
- `tsconfig.json` — current TypeScript config

---

## Implementation

### 1. Install Effect Packages

Run:

```bash
pnpm add effect
pnpm add -D @effect/vitest @effect/platform @effect/platform-node
```

The `effect` package is already installed (from the Effect setup earlier).
If it's not at the latest version, run `pnpm update effect` as well.

Verify packages are in `package.json`:
- `effect` in `dependencies` (root)
- `@effect/vitest` in `devDependencies` (root)
- `@effect/platform` in `devDependencies` (root)
- `@effect/platform-node` in `devDependencies` (root)

**Usage note for `@effect/platform` / `@effect/platform-node`:**
These packages provide Effect-based wrappers for Node.js APIs
(`FileSystem`, `Command`, `HttpServer`, `HttpClient`, etc.). They are
**not required immediately** — most of our code wraps Drizzle, AI SDK,
Clerk, etc. directly with `Effect.tryPromise`. However, they may be
useful in Session 04 when we wrap blob storage (the filesystem adapter
could use `@effect/platform-node`'s `NodeFileSystem` instead of
`node:fs`), and in Session 08 for scripts. Install them now so later
sessions don't need to modify `package.json` again.

### 2. Update `.dependency-cruiser.cjs`

The current `forbidden` rules ban certain npm packages in domain and
application. `effect` and `@effect/*` are **not** in the banned list,
so they are already allowed — no new "allow" rule is needed.

We only need to **add `zod` to the banned-packages paths** so that
once Session 2 removes Zod, it can never come back:

Update the `no-domain-importing-banned-packages` rule's `path` regex
to include `zod`:

```javascript
{
  name: 'no-domain-importing-banned-packages',
  severity: 'error',
  from: { path: '^packages/domain' },
  to: {
    dependencyTypes: ['npm'],
    path: 'node_modules/(drizzle-orm|@ai-sdk|@clerk|next|pdf-parse|pdf-lib|pg|@neondatabase|drizzle-kit|zod/)',
  },
},
```

Update the `no-application-importing-banned-packages` rule's `path`
regex to include `zod`:

```javascript
{
  name: 'no-application-importing-banned-packages',
  severity: 'error',
  from: { path: '^packages/application' },
  to: {
    dependencyTypes: ['npm'],
    path: 'node_modules/(drizzle-orm|@ai-sdk|@clerk|next|pdf-parse|pdf-lib|pg|@neondatabase|drizzle-kit|zod/)',
  },
},
```

**Note:** Do NOT add an `ignore`-severity rule for Effect packages.
`dependency-cruiser` only reports violations for `forbidden` rules —
since `effect` is not in any banned path, it's already allowed.

### 3. Create `packages/domain/src/ids.ts`

This file defines all branded ID types used across the codebase. Use
`Schema.brand` from Effect Schema. These types prevent mixing IDs of
different entities at compile time.

```typescript
import { Schema } from 'effect';

// ---- Entity IDs ----

/** Unique identifier for a document row. */
export const DocumentId = Schema.Number.pipe(Schema.brand('DocumentId'));
export type DocumentId = typeof DocumentId.Type;

/** Unique identifier for a ticket (e.g., 'TKT-abcd1234'). */
export const TicketId = Schema.String.pipe(Schema.brand('TicketId'));
export type TicketId = typeof TicketId.Type;

/** Clerk user ID (e.g., 'user_abc123'). */
export const ClerkUserId = Schema.String.pipe(Schema.brand('ClerkUserId'));
export type ClerkUserId = typeof ClerkUserId.Type;

/** Object storage key (e.g., 'docs/42/invoice.pdf'). */
export const StorageKey = Schema.String.pipe(Schema.brand('StorageKey'));
export type StorageKey = typeof StorageKey.Type;

// ---- Scalar IDs (for embedding dimensions, chunk indices, etc.) ----

/** Embedding dimension count. */
export const EmbeddingDimension = Schema.Number.pipe(
  Schema.brand('EmbeddingDimension'),
);
export type EmbeddingDimension = typeof EmbeddingDimension.Type;

/** Chunk index within a document (0-based). */
export const ChunkIndex = Schema.Number.pipe(Schema.brand('ChunkIndex'));
export type ChunkIndex = typeof ChunkIndex.Type;
```

### 4. Update `packages/domain/src/index.ts`

Add the new export:

```typescript
// Public re-exports for @app/domain.
export * from './result';
export * from './errors';
export * from './app-config';
export * from './ports';
export * from './ids';         // ← add this line
```

### 5. Verify `tsconfig.json`

Ensure the tsconfig has the Effect plugin (already added in the Effect
setup). No new changes needed — just verify:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "next" },
      { "name": "@effect/language-service" }
    ]
  }
}
```

### 6. Verify `vitest.config.ts`

Check the vitest config. If it imports `@effect/vitest/config`, confirm
the import is correct. If not, we may need to add it in a later session
when we convert tests. For now, just verify the config exists and tests
run.

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| None | — | — | No new env vars introduced |

---

## Schema / Migration Changes

None. The database schema is untouched.

---

## What Changed in the Codebase Structure

- `packages/domain/src/ids.ts` — new file with branded ID types
- `packages/domain/src/index.ts` — added `export * from './ids'`
- `.dependency-cruiser.cjs` — updated rules to allow Effect, ban zod
- `package.json` — new devDependencies (`@effect/vitest`, `@effect/platform`, `@effect/platform-node`)
- `pnpm-lock.yaml` — lock file updated

---

## Gotchas / Things to Watch Out For

1. **`pnpm-lock.yaml`**: Installing packages will produce a large lock
   file change. This is expected — don't skip the lock file in the commit.

2. **`Schema.brand` types**: The branded types are nominal — `DocumentId`
   is NOT assignable to `number`, even though it wraps a number. This is
   intentional but may cause type errors in places that currently pass
   raw numbers. Those will be fixed in Session 3 when we update the
   interfaces.

3. **Effect language service**: The Effect language service plugin
   provides editor diagnostics. If your IDE doesn't pick it up, restart
   the TypeScript server (F1 → "TypeScript: Restart TS Server").

---

## Validation

```bash
pnpm typecheck    # tsc — should pass (no type changes yet)
pnpm lint         # eslint — should pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass with updated rules
```

If `pnpm arch` fails, check that `zod` was added to the banned-packages
path regexes in both `no-domain-importing-banned-packages` and
`no-application-importing-banned-packages`. Effect and `@effect/*`
packages should NOT trigger a violation — they're not in any banned
path, so they're already allowed.

If `pnpm test` fails, check that `@effect/vitest` didn't conflict with
the existing vitest setup. The package only adds helpers — it shouldn't
break existing tests.

---

## Git Commit Strategy

```bash
git add packages/domain/src/ids.ts \
        packages/domain/src/index.ts \
        .dependency-cruiser.cjs \
        package.json \
        pnpm-lock.yaml \
        .gitignore
```

**Note on `.gitignore`:** The `.gitignore` was already updated during plan
creation to replace `docs/execution-plan/` with `docs/effect-migration/context/`.
If `.gitignore` already contains `docs/effect-migration/context/`, do NOT
stage it again — just verify the line is present. If any prior agent
session already committed this change, skip it entirely.
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-01): add Effect tooling, update arch rules, add branded IDs

Install @effect/vitest, @effect/platform, @effect/platform-node.
Update dependency-cruiser to allow effect everywhere and ban zod.
Create branded ID types (DocumentId, TicketId, ClerkUserId, etc).

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

**Do NOT push.** The developer pushes when ready.

---

## Handoff Instructions

When you complete this session, write
`docs/effect-migration/context/after-session-01.md` following the format
in `00-handoff-protocol.md`. Include:

1. **Confirm packages installed**: Which packages were added, with
   versions (check `package.json`).
2. **List the exact dependency changes**: what was added to root
   `package.json` devDependencies.
3. **Note any lock file changes**: was `pnpm-lock.yaml` updated cleanly?
4. **Confirm branded IDs created**: list the IDs defined in `ids.ts`.
5. **Confirm dependency-cruiser rules**: what rules were added/changed?
6. **Tell the next agent**: "Branded IDs are available in
   `packages/domain/src/ids.ts`. The architecture rules allow Effect
   everywhere and ban Zod. Read `ids.ts` to see the branded types.
   Session 2 will replace the error classes with `Schema.TaggedError`."

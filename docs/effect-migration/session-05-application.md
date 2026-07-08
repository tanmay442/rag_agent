# Session 05: Application — Use-Case Refinements

## Objective

Refine all application use-cases to idiomatic Effect patterns. Remove
`service-result.ts` entirely. Use `Effect.fn` for named functions with
tracing. Use `Effect.catchTag` for typed error handling at use-case
boundaries. Clean up any rough edges from Session 3.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-04.md` first.

Key things to know:
- All infrastructure services are Effect layers
- Application use-cases are already Effect.gen (from Session 3)
- `service-result.ts` may still exist with dead code
- All services are available via Context

---

## Implementation

### Phase 1: Delete Legacy Code

#### 1. Delete `packages/application/src/service-result.ts`

This file contained `wrapServiceCall`, `serviceResult`, and
`sanitizePagination`. All are no longer used (use-cases use Effect.gen
directly). Delete the file.

#### 2. Remove any remaining Result imports

Search for any remaining `import { ok, err, Result }` from `@app/domain`.
These should all be gone after Session 3. If any remain, remove them.

#### 3. Remove any remaining `Promise<Result<...>>` return types

Search for `Promise<Result<` in application source files. Convert any
remaining instances to `Effect<...>`.

### Phase 2: Refine Use-Cases

#### 4. Add `Effect.fn` tracing to all use-cases

Every use-case should be wrapped with `Effect.fn` for better error
messages and tracing:

```typescript
export const ingestFile = Effect.fn("Ingest.ingestFile")(
  (input: IngestFileInput) => Effect.gen(function* () {
    // ...
  })
);
```

This gives meaningful names in Effect's error output and fiber traces.

#### 5. Use `Effect.catchTag` where appropriate

At use-case boundaries where specific errors need special handling:

```typescript
export const uploadPdf = Effect.fn("Documents.uploadPdf")(
  (input: UploadPdfInput) => Effect.gen(function* () {
    const docs = yield* Documents;
    const chunks = yield* Chunks;
    const blob = yield* BlobStorage;
    // ...
  }).pipe(
    Effect.catchTag("ValidationError", (e) =>
      Effect.fail(new ValidationError(`Upload validation failed: ${e.message}`))
    )
  )
);
```

#### 6. Ensure consistent error types

Verify that every use-case returns the correct error types. For example:
- `searchChunks` should return `ExternalServiceError | ValidationError`
- `uploadPdf` should return `ExternalServiceError | ValidationError | NotFoundError`
- `setUserRole` should return `ValidationError | NotFoundError | ExternalServiceError`

#### 7. Clean up prompt building

`packages/application/src/prompt/build-system-prompt.ts` is a pure
function that doesn't do I/O. It can stay as-is or be wrapped in
`Effect.sync` if needed for consistency.

### Phase 3: Update Application Exports

#### 8. Update `packages/application/src/index.ts`

Ensure all use-case exports are correct. The barrel should export:
- All use-case functions (ingestFile, searchChunks, listDocuments, etc.)
- Type definitions (IngestFileInput, SearchDeps, etc.)
- No service-result utilities

#### 9. Update `packages/application/src/admin/index.ts`

Verify admin use-cases are properly exported.

#### 10. Update `packages/application/src/auth/index.ts`

Verify auth use-cases are properly exported.

#### 11. Update `packages/application/src/rag/index.ts`

Verify RAG use-cases are properly exported.

---

## Env Vars

No new env vars.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

- `packages/application/src/service-result.ts` — deleted
- All use-case files — refined with Effect.fn, consistent error types
- Application barrel exports — cleaned up

---

## Gotchas / Things to Watch Out For

1. **`Effect.fn` naming convention**: Use `"Domain.Operation"` format.
   Example: `"Ingest.ingestFile"`, `"Documents.uploadPdf"`.

2. **Error type consistency**: Every use-case should have a well-defined
   error union. If a use-case can fail in multiple ways, list all error
   types in the return type.

3. **Pure functions**: Functions that don't do I/O (like `buildSystemPrompt`)
   don't need `Effect.gen`. Keep them as regular functions. Only wrap
   them in `Effect.sync` if they need to be composed with effects.

4. **`Effect.catchTag` placement**: Put error recovery at the end of the
   pipeline, not in the middle of `Effect.gen`.

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
  -m "(effect-05): refine application use-cases, remove service-result.ts

Add Effect.fn tracing to all use-cases. Remove service-result.ts
entirely. Ensure consistent error types across all use-cases. Clean
up barrel exports. Application layer is now idiomatic Effect.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

---

## Handoff Instructions

Write `docs/effect-migration/context/after-session-05.md`. Include:

1. **Confirm service-result.ts deleted**
2. **List all use-cases with Effect.fn names**
3. **Confirm error type consistency**
4. **Confirm all 230 tests pass**
5. **Tell the next agent**: "Application use-cases are fully refined.
   Session 6 will rewrite composition.ts as layer assembly and convert
   all routes to Effect.runPromise boundaries."

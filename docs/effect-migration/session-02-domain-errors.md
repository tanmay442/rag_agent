# Session 02: Domain — Errors, Effect Schema, Remove Zod

## Objective

Replace the hand-rolled `DomainError` class hierarchy with Effect
`Schema.TaggedError` classes. Replace Zod schemas with Effect Schema.
Remove Zod from all package.json files. Update every error construction
callsite across the codebase.

`Result<T,E>` stays as a union type for now — it will be removed in
Session 3. This session only changes error constructors and validation
schemas.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-01.md` first.

Key things to know:
- Branded IDs are available in `packages/domain/src/ids.ts`
- `effect`, `@effect/vitest`, `@effect/platform`, `@effect/platform-node` are installed
- `zod` is banned by dependency-cruiser

---

## Implementation

### Phase 1: Domain Errors

#### 1. Rewrite `packages/domain/src/errors.ts`

Replace the entire file with `Schema.TaggedError` classes. Use
`Schema.TaggedErrorClass` — it extends `Error`, supports `cause`
natively, and integrates with Effect Schema for serialisation and
pattern matching.

**The single approach to use (do not use `Data.TaggedError`):**

```typescript
import { Schema } from 'effect';

// Schema.TaggedError classes extend Error, so they have .stack and
// .cause natively. Each class gets a _tag field for discrimination.

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  'ValidationError',
  {
    message: Schema.String,
    details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {
  readonly code = 'validation_error' as const;
  readonly status = 400 as const;

  constructor(message: string, details?: Record<string, unknown>, cause?: unknown) {
    super({ message, details }, cause);
  }
}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  'UnauthorizedError',
  {
    message: Schema.optional(Schema.String),
  },
) {
  readonly code = 'unauthorized' as const;
  readonly status = 401 as const;

  constructor(message = 'Unauthorized', cause?: unknown) {
    super({ message }, cause);
  }
}

export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  'ForbiddenError',
  {
    message: Schema.optional(Schema.String),
  },
) {
  readonly code = 'forbidden' as const;
  readonly status = 403 as const;

  constructor(message = 'Forbidden', cause?: unknown) {
    super({ message }, cause);
  }
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  'NotFoundError',
  {
    message: Schema.optional(Schema.String),
  },
) {
  readonly code = 'not_found' as const;
  readonly status = 404 as const;

  constructor(message = 'The requested resource was not found', cause?: unknown) {
    super({ message }, cause);
  }
}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  'ConflictError',
  {
    message: Schema.String,
  },
) {
  readonly code = 'conflict' as const;
  readonly status = 409 as const;

  constructor(message: string, cause?: unknown) {
    super({ message }, cause);
  }
}

export class GoneError extends Schema.TaggedErrorClass<GoneError>()(
  'GoneError',
  {
    message: Schema.String,
  },
) {
  readonly code = 'gone' as const;
  readonly status = 410 as const;

  constructor(message: string, cause?: unknown) {
    super({ message }, cause);
  }
}

export class RateLimitedError extends Schema.TaggedErrorClass<RateLimitedError>()(
  'RateLimitedError',
  {
    message: Schema.String,
    retryAfterMs: Schema.Number,
  },
) {
  readonly code = 'rate_limited' as const;
  readonly status = 429 as const;

  constructor(message: string, retryAfterMs: number, cause?: unknown) {
    super({ message, retryAfterMs }, cause);
  }
}

export class ExternalServiceError extends Schema.TaggedErrorClass<ExternalServiceError>()(
  'ExternalServiceError',
  {
    message: Schema.String,
  },
) {
  readonly code = 'external_service' as const;
  readonly status = 502 as const;

  constructor(message: string, cause?: unknown) {
    super({ message }, cause);
  }
}
```

**Key design points:**
- `code` and `status` are `readonly` class properties with `as const`
  literals — they are NOT Schema fields (they're static metadata).
- `cause` is passed as the second argument to `super()` — it's inherited
  from `Error` and works natively. No `(this as any).cause` hack.
- Each error class extends `Error` (via `Schema.TaggedErrorClass`), so
  `instanceof Error` still works. `instanceof DomainError` will NOT work
  — use `_tag` checks instead.
- Constructors remain backwards-compatible: `new ValidationError('msg')`
  still works exactly as before.
- The `_tag` field (e.g., `'ValidationError'`) is automatically set by
  `Schema.TaggedErrorClass`. Use it for discrimination in `http.ts` and
  `Effect.catchTag`.

#### 2. Replace the `DomainError` base class with a union type

The old `abstract class DomainError extends Error` is gone. `Schema.TaggedErrorClass` extends `Error` directly, so each error class is already an `Error`. Replace the base class with a union type for type checking:

```typescript
// Unified domain error type (discriminated union of all error tags)
export type DomainError =
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | GoneError
  | RateLimitedError
  | ExternalServiceError;
```

This union type is used as the default error type parameter in `Result<T, DomainError>` (which stays until Session 3 removes it). After Session 3, Effect's error channel replaces this union — callers use `Effect.catchTag` to handle specific errors.

#### 3. Update `src/lib/http.ts`

The `respond()` function uses `instanceof DomainError`. Change to `_tag`
checks:

```typescript
function respond(err: unknown): Response {
  if (err && typeof err === 'object' && '_tag' in err) {
    const tag = (err as { _tag: string })._tag;
    const errorMap: Record<string, { status: number; message: string }> = {
      ValidationError: { status: 400, message: 'Invalid input provided' },
      UnauthorizedError: { status: 401, message: 'Please sign in to continue' },
      ForbiddenError: { status: 403, message: 'You do not have permission to perform this action' },
      NotFoundError: { status: 404, message: 'The requested resource was not found' },
      ConflictError: { status: 409, message: 'A conflict occurred' },
      GoneError: { status: 410, message: 'This resource is no longer available' },
      RateLimitedError: { status: 429, message: 'Too many requests. Please try again later.' },
      ExternalServiceError: { status: 502, message: 'An external service is temporarily unavailable' },
    };
    const match = errorMap[tag];
    if (match) {
      const headers: Record<string, string> = {};
      if (tag === 'RateLimitedError' && 'retryAfterMs' in err) {
        headers['Retry-After'] = String(Math.ceil((err as { retryAfterMs: number }).retryAfterMs / 1000));
      }
      return Response.json({ error: match.message, code: err.code ?? tag.toLowerCase() }, {
        status: match.status,
        headers,
      });
    }
  }
  // Generic error
  if (err instanceof Response) return err;
  return Response.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 });
}
```

Also update `toErrorBody` and `respondResult` to use `_tag` checks.

#### 4. Update all error construction callsites

Search for every `new ValidationError(...)`, `new NotFoundError(...)`,
etc. across the codebase. The constructors have the same API signatures,
so most callsites should NOT need changes. Verify this is the case.

**Files to check:**
- `packages/application/src/admin/documents.ts` — constructs NotFoundError, ValidationError, GoneError, ConflictError, ExternalServiceError
- `packages/application/src/admin/tickets.ts` — constructs NotFoundError, ConflictError, ExternalServiceError
- `packages/application/src/auth/users.ts` — constructs ValidationError, NotFoundError, ExternalServiceError
- `packages/application/src/rag/ingest.ts` — constructs ValidationError, ExternalServiceError
- `packages/application/src/rag/search.ts` — constructs ExternalServiceError
- `packages/infrastructure/src/auth/clerk-adapter.ts` — constructs UnauthorizedError, ForbiddenError
- `packages/infrastructure/src/db/repositories.ts` — constructs Error (not DomainError — leave as-is for now)
- `src/composition.ts` — constructs NotFoundError, UnauthorizedError, ForbiddenError, ExternalServiceError, ValidationError, GoneError
- `src/app/api/chat/route.ts` — no direct error construction

The key change: error properties are now accessible via `_tag` and as
direct properties (e.g., `error.message`, `error.code`, `error.status`).
Previously, `code` and `status` were on the base class; now they're on
each Schema.TaggedError.

#### 5. Update `src/lib/http.ts` test file

The test file `src/lib/__tests__/http.test.ts` creates error instances
for testing. Update any `new DomainError(...)` patterns to use the new
Schema.TaggedError constructors. The test logic stays the same — just
the error construction changes.

### Phase 2: Zod → Effect Schema

#### 6. Replace `packages/domain/src/app-config.ts`

The current file uses Zod to validate the app config. Replace with
Effect Schema:

Current:
```typescript
import { z } from 'zod';

const appConfigSchema = z.object({
  orgName: z.string().default('Acme Corp'),
  // ...
});

export const appConfig = appConfigSchema.parse({});
```

New:
```typescript
import { Schema } from 'effect';

const AppConfigSchema = Schema.Struct({
  orgName: Schema.optional(Schema.String),
  agentName: Schema.optional(Schema.String),
  // ... same fields, using Effect Schema types
});

// Parse with defaults
export const appConfig = Schema.decodeUnknownSync(AppConfigSchema)({});
```

**Important**: Effect Schema's `decode` is stricter than Zod's `parse`.
Ensure all defaults are handled.

#### 7. Replace `src/app/api/chat/request-schema.ts`

Replace Zod with Effect Schema. **Preserve all validations from the
current Zod schema:**
- `text` field: `.max(50000)` → use `Schema.String.pipe(Schema.maxLength(50000))`
- `messages` array: `.max(100)` → use a refinement or `Schema.Array(Schema.Struct({ ... })).pipe(Schema.maxItems(100))`. If `maxItems` is unavailable in the Effect version, add a custom check after decoding: `if (data.messages.length > 100) return Effect.fail(...)`.
- `.strip()` (remove extra keys): Effect Schema's `Schema.decodeUnknownSync` **strips extra properties by default** (only declared fields are kept). This matches Zod's `.strip()` behavior.

```typescript
import { Schema } from 'effect';

const MAX_TEXT_LENGTH = 50_000;

const ACCEPTED_PART_TYPES = ['text', 'tool-invocation', 'step-start', 'step-finish', 'source'] as const;

const TextPart = Schema.Struct({
  type: Schema.Literal('text'),
  text: Schema.String.pipe(Schema.maxLength(MAX_TEXT_LENGTH)),
});

const OtherPart = Schema.Struct({
  type: Schema.Literals(ACCEPTED_PART_TYPES),
  text: Schema.optional(Schema.String.pipe(Schema.maxLength(MAX_TEXT_LENGTH))),
});

const MessagePartSchema = Schema.Union([TextPart, OtherPart]);

const ChatMessageSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  role: Schema.Literals(['user', 'assistant']),
  parts: Schema.Array(MessagePartSchema),
});
// Extra keys on messages are stripped by decodeUnknownSync.

// Array with max 100 messages — use a refinement:
export const ChatRequestSchema = Schema.Struct({
  messages: Schema.Array(ChatMessageSchema).pipe(
    Schema.filter((arr) => arr.length <= 100, { message: 'Too many messages' }),
  ),
});

// Usage in route handler:
// const parsed = Schema.decodeUnknownSync(ChatRequestSchema)(raw);
// Extra properties on the raw input are stripped automatically.
```

**Important differences from Zod:**
- `Schema.maxLength(n)` validates max string length (equivalent to Zod's `.max(n)`).
- `Schema.filter(predicate)` validates array constraints (equivalent to Zod's `.max(n)` on arrays).
- `Schema.decodeUnknownSync` **strips** unknown properties by default (matches Zod's `.strip()`). Use `Schema.decodeSync` if you want to **reject** unknown properties instead.

#### 8. Remove Zod from all package.json files

Search every `package.json` in the workspace for `zod` and remove it:

```bash
grep -r '"zod"' --include='package.json' .
```

Remove `zod` from dependencies/devDependencies in:
- `package.json` (root) — `dependencies`
- `packages/domain/package.json` — `dependencies`
- `packages/application/package.json` — check if present
- `packages/infrastructure/package.json` — check if present
- `packages/cli/package.json` — check if present

Run `pnpm install` after removing to update the lock file.

#### 9. Remove Zod imports

Search for all `import { z } from 'zod'` and `import { z } from 'zod/v4'`
across the codebase. Remove them. The files that used Zod:
- `packages/domain/src/app-config.ts` — replaced with Effect Schema
- `src/app/api/chat/request-schema.ts` — replaced with Effect Schema
- Possibly others — search and update

---

## Env Vars

No new env vars. No existing env vars changed.

---

## Schema / Migration Changes

None. The database schema is untouched. The Zod schemas in the domain
and routes are replaced with Effect Schema, but these are runtime
validation, not DB schemas.

---

## What Changed in the Codebase Structure

- `packages/domain/src/errors.ts` — rewritten with Schema.TaggedError
- `packages/domain/src/app-config.ts` — Zod → Effect Schema
- `src/app/api/chat/request-schema.ts` — Zod → Effect Schema
- `src/lib/http.ts` — `_tag` checks instead of `instanceof DomainError`
- `package.json` (root) — removed `zod`
- `packages/domain/package.json` — removed `zod`
- All files that construct errors — updated constructor calls (if API changed)
- `pnpm-lock.yaml` — updated after removing Zod

---

## Gotchas / Things to Watch Out For

1. **`instanceof` checks break**: Schema.TaggedError classes don't
   extend Error, so `instanceof Error` and `instanceof DomainError` no
   longer match. Every `instanceof` check must be converted to `_tag`
   string comparison. Search for `instanceof DomainError`, `instanceof
   ValidationError`, etc.

2. **Error.stack**: Schema.TaggedError instances don't have a `stack`
   property by default (they're data, not Error subclasses). If stack
   traces are needed for debugging, consider extending Error manually
   or using Effect's `UnknownException`.

3. **Effect Schema strictness**: `Schema.decodeUnknownSync` is stricter
   than Zod. If the current Zod schemas use `z.optional()` on nested
   fields, the Effect Schema equivalent must handle `undefined`
   correctly. Test all edge cases.

4. **`catch` blocks that check `error instanceof Error`**: Some catch
   blocks check for `Error` instances. These still work for errors
   thrown by external libraries (Drizzle, AI SDK, etc.) but NOT for
   our Schema.TaggedError errors. The catch blocks in application
   use-cases return `ExternalServiceError` when catching unknown errors,
   which is fine.

5. **Test assertions**: Tests that check `error instanceof NotFoundError`
   must change to `error._tag === 'NotFoundError'` or use a type guard.

---

## Validation

```bash
pnpm typecheck    # tsc — all type checks must pass
pnpm lint         # eslint — must pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass (zod is now banned)
```

If `pnpm arch` fails with a zod import, find and remove the remaining
zod import.

If `pnpm test` fails, check:
- Error construction changes in test files
- `instanceof` checks in tests that need `_tag` conversion
- Effect Schema decode errors (strictness differences)

---

## Git Commit Strategy

```bash
git add packages/domain/src/errors.ts \
        packages/domain/src/app-config.ts \
        src/app/api/chat/request-schema.ts \
        src/lib/http.ts \
        src/lib/__tests__/http.test.ts \
        package.json \
        packages/domain/package.json \
        pnpm-lock.yaml \
        $(grep -r "from 'zod'" --include="*.ts" --include="*.tsx" -l)
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-02): replace errors with Schema.TaggedError, Zod → Effect Schema

Replace DomainError hierarchy with Effect Schema.TaggedError classes.
Replace Zod validation schemas with Effect Schema (app-config, chat
request schema). Remove zod from all package.json files. Update http.ts
error mapping to use _tag checks.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

---

## Handoff Instructions

Write `docs/effect-migration/context/after-session-02.md`. Include:

1. **Confirm errors converted**: list all Schema.TaggedError classes.
2. **Confirm Zod removed**: no remaining zod imports.
3. **List any `instanceof` → `_tag` changes**: important for Session 3.
4. **Confirm all 230 tests pass**: note any test count changes.
5. **Tell the next agent**: "Errors are now Schema.TaggedError with `_tag`
   discrimination. Zod is gone — Effect Schema is the only validation
   library. `Result<T,E>` is still a union type but will be removed in
   Session 3. Read `packages/domain/src/errors.ts` to see the new error
   classes."

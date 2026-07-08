# Context After Session 02: Domain — Errors, Effect Schema, Remove Zod

## What Was Done

- Replaced the hand-rolled `DomainError` abstract class hierarchy in
  `packages/domain/src/errors.ts` with Effect `Schema.TaggedError` classes.
  Each error now carries a `_tag` field for discrimination and extends
  `Error` (so `instanceof Error` still works). `code`/`status` are
  `readonly` class props with `as const` literals (not schema fields).
  `cause` is modelled as an optional schema field (see Gotchas).
- Added a `DomainError` discriminated-union type (the 8 error classes).
- Rewrote `src/lib/http.ts` to discriminate on `_tag` instead of
  `instanceof DomainError` (via an `isDomainError` type guard).
- Replaced Zod with Effect Schema in `packages/domain/src/app-config.ts`
  and `src/app/api/chat/request-schema.ts`, preserving all validations and
  defaults. A zod-compatible `parse`/`safeParse` surface is exposed so the
  existing call sites (`config/index.ts`, `cli/commands/common.ts`,
  `cli/commands/init.ts`, `chat/route.ts`) keep working unchanged.
- Converted the two admin route handlers (`admin/tickets/[ticketId]` and
  `admin/users/[clerkId]/role`) from Zod to Effect Schema.
- Removed `zod` from `packages/domain/package.json` (the banned package).
  `pnpm-lock.yaml` was re-synced by `pnpm install`.

## Gotchas / Things to Watch Out For

1. **API differs from the plan's pseudo-code.** The installed Effect is
   `3.21.4`, which exposes `Schema.TaggedError` (not `TaggedErrorClass`),
   `Schema.Literal` (singular, not `Literals`), and surfaces decode results
   as `Either` via `Schema.decodeUnknownEither` (not an Effect you `.pipe`).
   The plan's snippets were adjusted to match the installed API.
2. **Custom constructors trigger an effect diagnostic** (`overriddenSchemaConstructor`).
   Each error class is preceded by the suppression comment
   `// @effect-diagnostics-next-line overriddenSchemaConstructor:off` so the
   backward-compatible positional constructors (`new ValidationError('msg')`)
   keep working. `tsc` honors this comment (verified).
3. **`cause` is a schema field, not a 2nd constructor arg.** This Effect
   version does not thread a second constructor argument into `Error.cause`,
   so `cause` is an optional `Schema.Unknown` field set via `super({ ...,
   cause })`. `instanceof Error` still returns `true`.
4. **Effect Schema decode produces readonly types.** `AppConfig` is declared
   as a separate mutable interface and the decoded value is cast to it,
   because the CLI (`init.ts`) mutates config fields before re-validating.
5. **`zod` remains in the root `package.json` and `src/app/api/chat/route.ts`.**
   The AI SDK's `tool({ inputSchema })` requires a Zod schema, so zod cannot
   be fully removed. This is intentional and does NOT violate the
   dependency-cruiser ban, which only forbids zod in `domain` and
   `application`. All zod usage in those two packages is gone (arch passes).

## Validation Results

- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm test`: pass (230 tests)
- `pnpm arch`: pass (no dependency violations; zod ban satisfied)

## What the Next Agent Should Know

Errors are now `Schema.TaggedError` classes with `_tag` discrimination
(`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
`ConflictError`, `GoneError`, `RateLimitedError`, `ExternalServiceError`).
Zod is gone from domain/application — Effect Schema is the only validation
library there. `Result<T,E>` is still a union type (error channel typed as
`DomainError`) but will be removed in Session 3. Read
`packages/domain/src/errors.ts` to see the new error classes. When handling
errors use `_tag` checks / `Effect.catchTag`, not `instanceof DomainError`.
Session 3 removes `Result` and moves callers onto the Effect error channel.

# Session 08: Cleanup — Logger, Config, Scripts, Docker Verification

## Objective

Final cleanup session. Replace the custom logger with Effect `Logger`.
Replace env validation with Effect `Config`. Update scripts and CLI.
Remove all remaining legacy/compat code. Verify Docker build and Vercel
deployment. Final validation.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-07.md` first.

Key things to know:
- All tests are @effect/vitest with 230 equivalents
- All code is Effect-based
- Custom logger still exists in `src/lib/logger.ts`
- Env validation still in `src/lib/env.ts`

---

## Implementation

### Phase 1: Logger

#### 1. Replace `src/lib/logger.ts` with Effect Logger

The custom logger should be replaced with Effect's built-in Logger:

```typescript
import { Logger, LogLevel } from "effect";

// Configure Effect Logger for production
export const AppLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.make({
    log: (fiberId, logLevel, message, cause, context) => {
      const entry = {
        level: logLevel.label,
        time: new Date().toISOString(),
        msg: typeof message === 'string' ? message : String(message),
        ...(cause ? { cause: String(cause) } : {}),
      };
      const line = JSON.stringify(entry);
      if (logLevel === LogLevel.Error) console.error(line);
      else if (logLevel === LogLevel.Warning) console.warn(line);
      else console.log(line);
    },
  })
);
```

Or more simply, use Effect's built-in JSON logger:

```typescript
import { Logger } from "effect";

export const AppLogger = Logger.pretty;
// Or: Logger.json for structured logging
```

#### 2. Update logger usage across the codebase

Search for all `logger.info(...)`, `logger.warn(...)`, `logger.error(...)`,
`logger.debug(...)` calls. Replace with `Effect.log`, `Effect.logWarning`,
`Effect.logError`, `Effect.logDebug`.

Files to update:
- `src/composition.ts` — `logger.error` in catch blocks
- `src/app/api/chat/route.ts` — `logger.error`, `logger.warn`, `logger.debug`
- `src/app/(app)/admin/actions.ts` — `logger.error` in catch blocks

**Pattern:**
```typescript
// Old
logger.error('Something failed', { error: err });

// New
yield* Effect.logError("Something failed", err);
```

#### 3. Delete `src/lib/logger.ts`

After all usages are replaced, delete the custom logger file.

#### 4. Update `src/lib/__tests__/env.test.ts`

If this test imports the logger, update the import.

### Phase 2: Config

#### 5. Replace `src/lib/env.ts` with Effect Config

The current `validateEnv()` function checks for required env vars.
Replace it with Effect's `Config` module. **Note:** `Config.layer()`
does NOT exist as an API. The correct pattern is to create an
`AppConfig` service layer using `Layer.effect` with `Config.string()`
calls inside — this was already done in Session 4.

`src/lib/env.ts` becomes a thin wrapper that runs the `AppConfig` layer
to validate all required env vars at startup:

```typescript
import { Effect, Layer } from "effect";
import { AppConfig } from "@app/domain";
import { AppConfigLive } from "@app/infrastructure";

/** Validate required env vars at server startup. Throws if any
 *  required config value is missing. Call this from instrumentation.ts
 *  or the top of the server entry point. */
export async function validateEnv(): Promise<void> {
  await Effect.runPromise(
    Effect.gen(function* () {
      // Just building the AppConfig layer validates all env vars.
      // If any required var is missing, Config.string() throws.
      yield* AppConfig;
    }).pipe(Effect.provide(AppConfigLive))
  ).catch((error) => {
    console.error("Environment validation failed:", error);
    process.exit(1);
  });
}
```

**Key point:** The `AppConfig` service (created in Session 4) already
loads all env vars via Effect `Config`. This session just removes the
old Zod-based `validateEnv` and points `instrumentation.ts` at the new
`AppConfig`-based validation. No new config services are needed here —
Session 4 already created them.

Deprecated `src/lib/env.ts` content (to be deleted):

- All Zod-based validation logic
- All `process.env` reads outside of the `AppConfig` layer
- The `ENV_VARS` spec object (env var names + required flags are now
  encoded in the `AppConfig` layer via `Config.string()` / `Config.option()`)

#### 6. Update `src/lib/config/index.ts`

The current config file validates `app.config.ts` against a schema.
Replace with Effect Schema validation:

```typescript
import { Schema } from "effect";
import { AppConfig } from "@app/domain";

export const appConfig = Schema.decodeUnknownSync(AppConfigSchema)(
  require("../../config/app.config").default
);
```

### Phase 3: Scripts and CLI

#### 7. Update scripts

Files:
- `scripts/migrate.ts`
- `scripts/seed-docs.ts`
- `scripts/setup-test-db.ts`
- `scripts/teardown-test-db.ts`
- `scripts/apply-migration.mjs`
- `scripts/backfill-blobs.ts`

These scripts use `console.log` and direct imports. Update them to use
Effect where appropriate, or keep them as plain scripts if they don't
benefit from Effect.

**Recommendation:** Scripts can stay as plain TypeScript with
`console.log`. They don't need Effect unless they call services. If they
call services (like `migrate.ts` calling Drizzle), wrap the service calls
in `Effect.runPromise`.

#### 8. Update CLI package

`packages/cli/src/index.ts` — The CLI uses Effect's CLI module (already
installed). Ensure it works with the new service architecture.

### Phase 4: Remove Legacy Code

#### 9. Remove all compat/legacy code

Search for and remove:
- Any remaining `Result` type references
- Any remaining `ok()`/`err()` helper imports
- Any remaining Zod imports
- Any remaining `DomainError` base class references
- Any `void ... .catch(console.error)` patterns — replace with Effect
- Dead code, unused imports

#### 10. Remove Zod from all package.json files

Ensure `zod` is completely gone from:
- Root `package.json`
- `packages/domain/package.json`
- `packages/application/package.json`
- `packages/infrastructure/package.json`
- `packages/cli/package.json`

Run `pnpm install` to clean up the lock file.

#### 11. Remove deprecated `@effect/schema` if present

Check if `@effect/schema` was ever installed. It should NOT be — Effect
Schema is built into `effect` since v3.10. Remove if present.

### Phase 5: Docker and Deployment Verification

#### 12. Verify Docker build

```bash
docker compose up -d db  # Start local Postgres
pnpm db:push             # Push schema
pnpm build               # Verify Next.js build works
docker compose down      # Clean up
```

The Dockerfile should work unchanged:
- Stage 1: `pnpm install --frozen-lockfile` + `pnpm next build`
- Stage 2: Copy standalone output + static files

#### 13. Verify Vercel deployment

If you have Vercel CLI:
```bash
vercel build             # Verify Vercel build
```

Or push to the Vercel-connected branch and verify the deployment.

#### 14. Verify no new env vars

Check that no new env vars were introduced. The migration should use
the same env vars as before, just loaded via Effect Config instead of
`process.env` directly.

#### 15. Update README if needed

If the README references Zod, `Result<T,E>`, or old patterns, update it.
Keep the Quick Start section unchanged (same env vars, same commands).

---

## Env Vars

No new env vars. All existing env vars continue to work. The migration
changes how they're loaded (Effect Config instead of `process.env`)
but the names and values don't change.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

- `src/lib/logger.ts` — deleted (replaced with Effect Logger)
- `src/lib/env.ts` — rewritten with Effect Config
- `src/lib/config/index.ts` — updated for Effect Schema
- All logger callsites — replaced with Effect.log*
- All remaining legacy code removed
- `package.json` files — zod removed
- `pnpm-lock.yaml` — updated

---

## Gotchas / Things to Watch Out For

1. **Docker build**: The Dockerfile runs `pnpm install --frozen-lockfile`.
   If the lock file changed significantly, Docker cache may be
   invalidated. This is normal.

2. **Vercel build**: `pnpm build` runs `tsx scripts/migrate.ts && next build`.
   Ensure `migrate.ts` still works with the new code. If it imports
   services, it needs to use Effect.

3. **Logger in edge runtime**: Effect Logger may not work in edge
   runtime (src/proxy.ts). If so, keep `console.log` in the middleware.

4. **`process.env` in client components**: Some Next.js code reads
   `process.env.NEXT_PUBLIC_*` in client components. These cannot use
   Effect Config (Effect runs server-side). Leave them as-is.

5. **`instrumentation.ts`**: This file runs at server startup. It may
   use `console.error` for OpenTelemetry setup. Leave as-is or convert
   to Effect.

---

## Validation

```bash
pnpm typecheck    # tsc — must pass
pnpm lint         # eslint — must pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass
pnpm build        # Next.js build — must succeed
```

Additional verification:
```bash
# Docker (optional)
docker compose up -d db
pnpm db:push
pnpm build
docker compose down
```

---

## Git Commit Strategy

```bash
git add -A
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-08): final cleanup — logger, config, scripts, Docker verify

Replace custom logger with Effect Logger. Replace env validation with
Effect Config. Remove all legacy code (Zod, Result, compat shims).
Update scripts and CLI. Verify Docker build. Final validation.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓, build ✓"
```

---

## Handoff Instructions

This is the final session. Write
`docs/effect-migration/context/after-session-08.md`. Include:

1. **Confirm migration complete**: all Effect services, layers, and
   patterns are in place
2. **Confirm Zod removed**: no remaining Zod references
3. **Confirm logger replaced**: Effect Logger in use
4. **Confirm Docker build works**: if verified
5. **Final test count**: confirm all 230 tests pass
6. **List any remaining TODOs**: items that were deferred or skipped
7. **Tell the developer**: "The Effect migration is complete. All 8
   sessions are done. The codebase is fully Effect-based with
   Schema.TaggedError, Context.Service, Layer, Effect.gen, and
   @effect/vitest. Docker build and Vercel deployment are unchanged."

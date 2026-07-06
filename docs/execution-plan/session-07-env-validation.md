# Session 07: Centralized Env Validation + `instrumentation.ts`

## Objective

Create a single `src/lib/env.ts` module that validates every required
environment variable for the selected providers and emits one
actionful error listing all missing keys. Hook it into Vercel's
`instrumentation.ts` so it runs once per region on cold start. Keep
the per-adapter guards as defense-in-depth, but the user-facing first
failure becomes a single actionable message instead of a one-at-a-time
crash loop.

This session must come after Sessions 1-6 because it needs to know
every env var the prior sessions introduced.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-06.md` first. The auth
decoupling from Session 6 should be complete. Read all prior handoff
files (`after-session-01.md` through `after-session-06.md`) to compile
the complete list of env vars introduced across all sessions.

### Compile the Complete Env Var List

Before writing `env.ts`, read every handoff file and compile a list of
every env var introduced across all sessions. The list should include:

**Always required:**
- `DATABASE_URL` (Session 1)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (original)
- `CLERK_SECRET_KEY` (original)

**Conditionally required based on provider selection:**
- `AI_STUDIO_KEY` — if `EMBEDDING_PROVIDER=google` (Session 2)
- `CUSTOM_LLM_API_KEY` + `CUSTOM_LLM_BASE_URL` — if
  `CHAT_PROVIDER=openai` (original + Session 2)
- `OLLAMA_BASE_URL` — if `EMBEDDING_PROVIDER=ollama` or
  `CHAT_PROVIDER=ollama` (Session 2)
- `OPENAI_EMBEDDING_API_KEY` + `OPENAI_EMBEDDING_BASE_URL` — if
  `EMBEDDING_PROVIDER=openai` (Session 2)
- `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` +
  `R2_BUCKET` — if `BLOB_STORAGE_PROVIDER=r2` (Session 3)
- `S3_*` — if `BLOB_STORAGE_PROVIDER=s3` (Session 3)
- `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` +
  `QSTASH_NEXT_SIGNING_KEY` + `QSTASH_INGEST_WORKER_URL` — if
  `QSTASH_TOKEN` is set (Session 4)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — optional,
  if set, Upstash is used (Session 5)

**Optional with defaults:**
- `EMBEDDING_PROVIDER` (default `google`) — Session 2
- `CHAT_PROVIDER` (default `openai`) — Session 2
- `BLOB_STORAGE_PROVIDER` (default `filesystem`) — Session 3
- `AUTH_PROVIDER` (default `clerk`) — Session 6
- `EMBEDDING_DIMENSION` (default `768`) — original
- `LOG_LEVEL` (default `info`) — original
- `ADMIN_EMAILS` — original, optional
- `SEED_DOCS_DIR`, `SEED_USER_ID` — original, optional
- `NEON_API_KEY`, `NEON_PROJECT_ID` — original, optional (CI)

### Files to Read First

- `packages/infrastructure/src/db/pool.ts` — current `DATABASE_URL`
  guard
- `packages/infrastructure/src/llm/google-embedding-service.ts` —
  current `AI_STUDIO_KEY` guard
- `packages/infrastructure/src/llm/openai-chat-service.ts` — current
  `CUSTOM_LLM_API_KEY` / `CUSTOM_LLM_BASE_URL` guard
- `packages/infrastructure/src/llm/index.ts` — provider factory
  (Session 2)
- `packages/infrastructure/src/storage/blob-storage-factory.ts` —
  blob storage factory (Session 3)
- `packages/infrastructure/src/queue/index.ts` — queue factory
  (Session 4)
- `packages/infrastructure/src/auth/auth-factory.ts` — auth factory
  (Session 6)
- `.env.example` — current template
- `src/lib/logger.ts` — logger for error output

---

## Implementation

### 1. Create `src/lib/env.ts`

```typescript
import { logger } from './logger';

interface EnvVarSpec {
  name: string;
  required: boolean;
  description: string;
  condition?: () => boolean;  // if false, var is not required
}

function providerIs(provider: string, envVar: string): boolean {
  return process.env[envVar] === provider;
}

const ENV_VARS: EnvVarSpec[] = [
  // Always required
  { name: 'DATABASE_URL', required: true, description: 'Neon Serverless Postgres connection string' },
  { name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', required: true, description: 'Clerk publishable key' },
  { name: 'CLERK_SECRET_KEY', required: true, description: 'Clerk secret key' },

  // Embedding provider
  { name: 'AI_STUDIO_KEY', required: true, description: 'Google AI Studio API key', condition: () => providerIs('google', 'EMBEDDING_PROVIDER') },
  { name: 'OPENAI_EMBEDDING_API_KEY', required: true, description: 'OpenAI-compatible embedding API key', condition: () => providerIs('openai', 'EMBEDDING_PROVIDER') },
  { name: 'OPENAI_EMBEDDING_BASE_URL', required: true, description: 'OpenAI-compatible embedding base URL', condition: () => providerIs('openai', 'EMBEDDING_PROVIDER') },
  { name: 'OLLAMA_BASE_URL', required: true, description: 'Ollama server URL', condition: () => providerIs('ollama', 'EMBEDDING_PROVIDER') || providerIs('ollama', 'CHAT_PROVIDER') },

  // Chat provider
  { name: 'CUSTOM_LLM_API_KEY', required: true, description: 'OpenAI-compatible chat API key', condition: () => providerIs('openai', 'CHAT_PROVIDER') },
  { name: 'CUSTOM_LLM_BASE_URL', required: true, description: 'OpenAI-compatible chat base URL', condition: () => providerIs('openai', 'CHAT_PROVIDER') },

  // Blob storage
  { name: 'R2_ACCOUNT_ID', required: true, description: 'Cloudflare R2 account ID', condition: () => providerIs('r2', 'BLOB_STORAGE_PROVIDER') },
  { name: 'R2_ACCESS_KEY_ID', required: true, description: 'R2 access key', condition: () => providerIs('r2', 'BLOB_STORAGE_PROVIDER') },
  { name: 'R2_SECRET_ACCESS_KEY', required: true, description: 'R2 secret key', condition: () => providerIs('r2', 'BLOB_STORAGE_PROVIDER') },
  { name: 'R2_BUCKET', required: true, description: 'R2 bucket name', condition: () => providerIs('r2', 'BLOB_STORAGE_PROVIDER') },

  // QStash (required if QSTASH_TOKEN is set)
  { name: 'QSTASH_CURRENT_SIGNING_KEY', required: true, description: 'QStash current signing key', condition: () => !!process.env.QSTASH_TOKEN },
  { name: 'QSTASH_NEXT_SIGNING_KEY', required: true, description: 'QStash next signing key', condition: () => !!process.env.QSTASH_TOKEN },
  { name: 'QSTASH_INGEST_WORKER_URL', required: true, description: 'Public URL for ingest worker', condition: () => !!process.env.QSTASH_TOKEN },
];

export interface ValidationResult {
  ok: boolean;
  missing: Array<{ name: string; description: string }>;
  message: string;
}

export function validateEnv(): ValidationResult {
  const missing: Array<{ name: string; description: string }> = [];

  for (const spec of ENV_VARS) {
    if (!spec.required) continue;
    if (spec.condition && !spec.condition()) continue;
    const value = process.env[spec.name];
    if (!value || value.trim() === '') {
      missing.push({ name: spec.name, description: spec.description });
    }
  }

  if (missing.length === 0) {
    return { ok: true, missing: [], message: '' };
  }

  const lines = missing.map(
    (m) => `  - ${m.name.padEnd(35)} ${m.description}`,
  );
  const message = [
    'Missing required environment variables for the selected providers:',
    ...lines,
    '',
    'Copy these into .env.local or your Vercel project settings.',
    'To skip a provider, change the corresponding *_PROVIDER env var.',
  ].join('\n');

  return { ok: false, missing, message };
}
```

### 2. Create `instrumentation.ts` (project root)

Vercel's `instrumentation.ts` hook runs once per region on cold start:

```typescript
export async function register() {
  // Only run on the server (not in the browser)
  if (process.env.NEXT_RUNTIME) {
    const { validateEnv } = await import('./src/lib/env');
    const result = validateEnv();
    if (!result.ok) {
      console.error(result.message);
      // Don't throw — let the app boot but log the error.
      // The per-adapter guards will throw at call time with
      // a specific message if a required key is missing.
      // Throwing here would prevent the app from starting at
      // all, which makes it harder to debug (no logs, no UI).
      //
      // Alternatively, you CAN throw here to fail fast:
      // throw new Error(result.message);
      //
      // Recommendation: log the error, don't throw. The
      // per-adapter guards are the actual enforcement point.
    }
  }
}
```

**Decision: log vs throw.** The plan recommends **logging, not
throwing** in `instrumentation.ts`. Reasons:
- If you throw, the Vercel function crashes before any request can be
  served. The user sees a 500 with no useful message.
- If you log, the app boots, and the first request that touches a
  missing adapter gets the adapter's specific error message (e.g.,
  "AI_STUDIO_KEY is not set").
- The centralized validation is a **developer experience** improvement
  (one clear message in the logs), not a runtime enforcement gate.

However, for local dev (`pnpm dev`), you may want to throw so the
developer sees the error immediately in the terminal. Add a check:

```typescript
if (!result.ok) {
  console.error(result.message);
  if (process.env.NODE_ENV === 'development') {
    throw new Error(result.message);
  }
}
```

### 3. Keep per-adapter guards

Do NOT remove the existing guards in:
- `packages/infrastructure/src/db/pool.ts` (missing `DATABASE_URL` stub)
- `packages/infrastructure/src/llm/google-embedding-service.ts`
  (`AI_STUDIO_KEY` check)
- `packages/infrastructure/src/llm/openai-chat-service.ts`
  (`CUSTOM_LLM_API_KEY` / `CUSTOM_LLM_BASE_URL` check)
- `packages/infrastructure/src/storage/blob-storage-r2.ts` (R2 keys
  check)
- `packages/infrastructure/src/auth/clerk-adapter.ts` (Clerk keys
  check, if it has one)

These are defense-in-depth — they catch the case where someone changes
a `*_PROVIDER` env var at runtime without restarting, or where
`instrumentation.ts` doesn't run (e.g., in a test environment).

### 4. Create `src/lib/__tests__/env.test.ts`

Test the validation logic:

```typescript
describe('validateEnv', () => {
  it('returns ok when all required vars are set', () => {
    // Set all required vars for default providers
    // ...
    expect(validateEnv().ok).toBe(true);
  });

  it('lists all missing vars in one call', () => {
    // Unset DATABASE_URL, AI_STUDIO_KEY, CLERK_SECRET_KEY
    // ...
    const result = validateEnv();
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing.map(m => m.name)).toContain('DATABASE_URL');
    expect(result.missing.map(m => m.name)).toContain('AI_STUDIO_KEY');
    expect(result.missing.map(m => m.name)).toContain('CLERK_SECRET_KEY');
  });

  it('does not require AI_STUDIO_KEY when EMBEDDING_PROVIDER=ollama', () => {
    process.env.EMBEDDING_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    delete process.env.AI_STUDIO_KEY;
    // ... set other required vars
    const result = validateEnv();
    expect(result.missing.map(m => m.name)).not.toContain('AI_STUDIO_KEY');
  });

  it('requires R2 vars only when BLOB_STORAGE_PROVIDER=r2', () => {
    process.env.BLOB_STORAGE_PROVIDER = 'filesystem';
    delete process.env.R2_ACCOUNT_ID;
    // ...
    expect(result.missing.map(m => m.name)).not.toContain('R2_ACCOUNT_ID');
  });
});
```

### 5. Verify `instrumentation.ts` is picked up by Next.js

Next.js 16 automatically loads `instrumentation.ts` from the project
root. No configuration needed. Verify that the `register()` function
runs on cold start by checking the Vercel function logs after a deploy.

---

## Env Vars

No new env vars. This session validates existing env vars.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

New files:
- `src/lib/env.ts`
- `src/lib/__tests__/env.test.ts`
- `instrumentation.ts` (project root)

Modified: None (per-adapter guards stay unchanged).

---

## Gotchas / Things to Watch Out For

1. **`instrumentation.ts` location**: In Next.js 16, this file goes in
   the project root (same level as `next.config.ts`), not in `src/`.
   If you have an `instrumentation-node.ts` or
   `instrumentation-edge.ts` variant, Next.js supports those too for
   runtime-specific logic.

2. **`process.env.NEXT_RUNTIME`**: This is set by Next.js to `'nodejs'`
   or `'edge'` at runtime. In the browser it's undefined. The guard
   `if (process.env.NEXT_RUNTIME)` ensures the validation only runs on
   the server.

3. **Dynamic import in `instrumentation.ts`**: Use `await import(...)`
   instead of a static import for `src/lib/env`. This ensures the
   validation module (and its dependencies) are only loaded on the
   server, not bundled into the client.

4. **Test environment**: `validateEnv()` reads `process.env` directly.
   In tests, you need to set/unset env vars carefully. Use
   `vi.stubEnv()` or manually set `process.env` in `beforeEach` /
   `afterEach`. Be careful not to leak env vars between tests.

5. **`NEXT_PUBLIC_*` vars**: These are inlined at build time, not read
   at runtime. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is available to the
   client. The validation should still check it (it's required for
   Clerk to work), but remember it can't be changed at runtime.

6. **Don't throw in production `instrumentation.ts`**: If you throw in
   `register()`, the Vercel function won't start. This makes debugging
   harder (no UI, no API). Log the error and let the per-adapter guards
   handle enforcement. In development, throwing is fine — the developer
   sees the error in the terminal immediately.

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run — env.test.ts must pass, all others unchanged
pnpm arch         # dependency-cruiser
```

Manual test:
```bash
# Unset several required vars
unset DATABASE_URL
unset AI_STUDIO_KEY
unset CLERK_SECRET_KEY
pnpm dev
# Should see one error message in the terminal listing all three
# missing vars with descriptions

# Set them back
export DATABASE_URL=postgres://...
export AI_STUDIO_KEY=...
export CLERK_SECRET_KEY=...
pnpm dev
# Should boot normally
```

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-07): centralized env validation + instrumentation.ts

Add src/lib/env.ts with validateEnv() that checks every required
env var for the selected providers. Hook into instrumentation.ts
for cold-start validation. One actionable error message listing
all missing keys. Per-adapter guards kept as defense-in-depth.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-07.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

Write `docs/execution-plan/context/after-session-07.md`. Include:

1. **The complete env var list**: every var that `env.ts` validates,
   organized by "always required" vs "conditionally required".
2. **The log-vs-throw decision**: log in production, throw in
   development.
3. **The `instrumentation.ts` location**: project root, not `src/`.
4. **Confirm per-adapter guards are unchanged**: defense-in-depth stays.
5. **Tell the next agent**: "Env validation is centralized in
   `src/lib/env.ts`. `instrumentation.ts` at the project root runs it
   on cold start. Missing vars produce one actionable error message
   listing all missing keys. Per-adapter guards remain as
   defense-in-depth. The complete env var list (always required +
   conditionally required) is in `src/lib/env.ts`. Read that file to
   see every var the app needs."

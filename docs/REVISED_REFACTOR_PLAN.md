# Revised Refactor Plan

A corrected, implementation-ready version of the original refactor plan. Every item below was verified against the actual source (file:line cited) and accounts for the issues found during cross-audit.

---

## Commit 1 — `fix(rag): persist embeddings and make replace-by transactional`

**Root cause:** `packages/application/src/rag/ingest.ts:64` calls `await deps.embeddings.embedBatch(texts)` and discards the result. The `chunks` table is never written, so `searchChunks` always returns `[]`. Additionally, `ingest.ts:50` deletes the old document *before* parsing/embedding, so any failure after that point permanently drops data.

**Changes:**
- `packages/application/src/rag/ingest.ts`:
  - Add `chunks: ChunkRepository` to `IngestDeps`.
  - Capture `const embeddings = await deps.embeddings.embedBatch(texts)`.
  - Move `deleteById(existing.id)` to **after** successful insert of both document and chunks (insert-new-then-delete-old). This keeps the old doc alive until the new one is fully persisted.
  - Insert document first: `const inserted = await deps.documents.insert({...})`.
  - Then insert chunks: `await deps.chunks.insertMany(texts.map((t, i) => ({ documentId: inserted.id, content: t, embedding: embeddings[i] })))`.
  - Remove the misleading comment that claims the documents adapter wraps a transaction (it does not).
- `src/composition.ts:82-88`: add `chunks: chunkRepo` to `ingestDeps`.
- `packages/cli/src/commands/seed.ts`: add `chunks` to the inline `ingestDeps` (mirror `composition.ts`).

**Why this is #1:** nothing else matters if retrieval is empty, and data-loss on re-ingest is unacceptable.

---

## Commit 2 — `fix(rag): guard vector search and parameterize the vector literal`

- `packages/application/src/rag/search.ts:40`: wrap `chunks.searchByVector` in try/catch → `ExternalServiceError` (currently unguarded → uncaught 500).
- `packages/infrastructure/src/db/repositories.ts:60-75`: validate `embedding` is a non-empty finite-number array before stringifying; pass the vector as a parameterized value. Keep the cosine-distance SQL but make the literal safe.

---

## Commit 3 — `feat(rag): configurable embedding provider and dimension`

Per your choice. Today `gemini-embedding-001` (768) is hardcoded (`google-embedding-service.ts:14`) and `schema-vector.ts:5` is fixed `vector(768)`.

**Changes:**
- `packages/domain/src/embedding-providers.ts` (new): a registry of known providers — `{ id, label, provider: 'google'|'openai', model, defaultDimension, envVar, providerOptions? }`. Seed with: Google `gemini-embedding-001` (768), OpenAI `text-embedding-3-small` (1536), OpenAI `text-embedding-3-large` (3072).
- `packages/infrastructure/src/llm/embedding-service.ts`: factory that reads `EMBEDDING_PROVIDER` (default `gemini`) + existing `AI_STUDIO_KEY` / new `OPENAI_API_KEY`, returns the `EmbeddingService` port and the active dimension.
- `schema-vector.ts`: accept a `dimension` param → `vector(dim)` factory function.
- `schema.ts:27`: `embedding: vector(getActiveDimension()).notNull()`.
- `drizzle.config.ts:6`: change `schema: './src/lib/db/schema.ts'` → `schema: './packages/infrastructure/src/db/schema.ts'` (currently points to a non-existent path, so `db:push` silently finds zero tables).
- Composition + chat route use the factory. The config CLI writes `EMBEDDING_PROVIDER` and warns on dimension mismatch with an existing non-empty `chunks` table (re-index required).

**Migration path:** On an existing populated DB, changing dimension requires a full re-index. The CLI will detect a non-empty `chunks` table and refuse/block with instructions rather than silently corrupt.

---

## Commit 4 — `fix(db): enable pgvector via migration script and wire it into setup`

**Root cause:** pgvector is never enabled automatically. The plan mentioned `drizzle/ new migration 0001_enable_pgvector.sql`, but `drizzle-kit push` cannot run raw SQL migrations that use `CREATE EXTENSION`. The extension must be enabled before Drizzle touches tables that use the `vector` type.

**Changes:**
- `scripts/apply-migration.mjs` (new or update): add a pre-migration step that runs `CREATE EXTENSION IF NOT EXISTS vector;` directly against `DATABASE_URL`.
- `packages/cli/src/index.ts:53-68` (`db-migrate` command): ensure the extension SQL runs **before** `drizzle-kit push`.
- `scripts/setup-test-db.ts:207-209`: ensure `apply-migration.mjs` (or the extension step) runs before `db:push`.

---

## Commit 5 — `feat(api): respond() HTTP error mapper + consistent route handling`

The domain layer (`errors.ts:1-7`) documents a `respond()` helper in `src/lib/http.ts` that **doesn't exist** — every route hand-rolls `{ error: (err as Error).message }` status 500, leaking internal messages.

- `src/lib/http.ts` (new): `respond(result | error)` maps `DomainError` subclasses → their `.status` (already defined on each class), generic `Error` → 500 with a safe message, JSON `{ error, code }`.
- Convert **all** server actions (`src/app/(app)/admin/actions.ts:41-76, 79-124, 131-204, 216-254`) to use a safe error mapper. Stop echoing raw `.message` to clients. Map known `DomainError` types to safe, user-facing strings.
- Convert API routes to use the same `respond()` helper.

---

## Commit 6 — `fix(api): validation, audit correctness, impersonation & upload hardening`

- `src/composition.ts:191-199` `parseQueryPagination`: add `Number.isFinite` guard → fall back to default (currently `?limit=foo` → `NaN` flows to the DB).
- **Audit semantics:**
  - `packages/application/src/ports/index.ts:136-142`: add `'role_change'` to `TicketAuditAction`.
  - `packages/application/src/auth/audit.ts:14-24`: update `logTicketEvent` type to accept `'role_change'`.
  - `packages/application/src/admin/documents.ts:122-132`: swap `hardDeleteDocument` to **act-then-audit** (delete first, then log). Wrap in a repository-level transaction if the adapter supports it.
- **Impersonation** (`src/app/api/admin/users/[clerkId]/impersonate/route.ts`): block self-impersonation and admin→admin.
- **Upload** (`src/app/(app)/admin/actions.ts:51`): replace extension-only check with `%PDF-` magic-byte validation; enforce size on the API route too (server action has it, raw API route doesn't).

---

## Commit 7 — `perf(db): indexes + debounce last-seen writes`

- `schema.ts`: add indexes — `documents(deleted_at)` + `documents(uploaded_at desc)` (every list/analytics call currently full-scans + sorts), `chunks(document_id)` (cascade + counts), `tickets(status)`.
- `packages/infrastructure/src/auth/session.ts:90`: debounce `touchLastSeen` (only write if `last_seen_at` older than ~60s) — today every authenticated request writes the `users` row.
- `getAnalyticsSummary`: stop fetching a useless row with `limit:0` (M3).

---

## Commit 8 — `refactor: decompose chat route handler`

Split `src/app/api/chat/route.ts` (284 lines, auth+ratelimit+parse+prefetch+streamText+tools+ticket-id-retry+citation-wrap) into `streamChatResponse()`, `buildChatTools()`, `emitCitations()`.berger. Fix the misleading "SELECT FOR UPDATE" comment (H8: there is none; the unique constraint is what actually serializes). Preserve all existing chat-route tests.

---

## Commit 9 — `refactor(cli): decompose runInit + safe config serialization`

- Split `packages/cli/src/commands/init.ts:133-284` `runInit` (152 lines) into `promptOrg`, `promptPersona`, `promptOutOfScope`, `promptAdmin`, `promptSeed`, `writeOutputs`.
- Remove `process.exit(1)` inside the library path (`init.ts:238`) → throw, let the CLI entry decide. Makes the failure path unit-testable.
- Replace the regex JSON→TS serializer (`init.ts:292`) that mangles values containing `":` or backticks with a proper recursive serializer.

---

## Commit 10 — `feat(cli): one-command interactive setup` ⭐ (the headline feature)

Rebuild `rag-agent init` / `pnpm setup` into a true end-to-end first-run wizard. After `git clone` + `pnpm install`, **one command** sets up everything and validates it works.

**Critical prerequisite:** This commit is only reachable if the `setup` script and CLI subcommand are correctly wired (see Commit 11).

New flow (single `pnpm setup`):
1. **Welcome + prereq check**: verify Node/pnpm versions; warn if `node_modules` missing and offer to run `pnpm install`.
2. **Env collection** (new — currently env is manual): prompt for `DATABASE_URL`, `AI_STUDIO_KEY`/`OPENAI_API_KEY`, `CUSTOM_LLM_API_KEY`/`BASE_URL`, `LLM_MODEL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`. Write to `.env.local`. Values shown as `[hidden]`, never echoed or logged.
3. **Embedding model selection** (Commit 3): list providers; record `EMBEDDING_PROVIDER`.
4. **Validate as it goes**: ping the DB (`SELECT 1`), test the embedding endpoint with a throwaway embed, test the chat endpoint with a 1-token call, validate Clerk keys via the Backend SDK. Re-prompt on failure with the actual error.
5. **Org/persona/admin/docs** (existing `runInit` prompts, now decomposed).
6. **Migrate**: run `db-migrate --force` (now working after Commit 4) — creates tables + enables pgvector.
7. **Seed**: if user has no PDFs, offer to `pnpm cli fixtures` → generate sample corpus → seed (today: nothing wires fixture-gen into seeding, and both `documents/` and `scripts/fixtures/` are gitignored so a fresh clone has nothing to seed). Otherwise point at their folder.
8. **Verify end-to-end**: run a real `searchChunks` against the seeded corpus and confirm non-empty results — this is the smoke test that proves RAG works (and would have caught the Commit-1 bug).
9. **Print next steps**: `pnpm dev`, first-admin sign-in URL, where to add more docs.

Implementation: new earbuds new `packages/cli/src/commands/setup.ts` orchestrating the decomposed steps; `init.ts` becomes the config-only subset. Update `.env.example` (Commit 11) so non-interactive users still have a reference. All secret writes use `0600`.

---

## Commit 11 — `chore: wire pnpm setup script + complete .env.example + README`

**Root cause:** The headline `pnpm setup` wizard in Commit 10 is unreachable because `package.json` and the CLI dispatcher were never updated.

**Changes:**
- `package.json:22`: change `"setup": "tsx scripts/setup.ts"` → `"setup": "tsx packages/cli/src/index.ts setup"`.
- `scripts/setup.ts`: either remove (orphan) or update to delegate to the new `setup` subcommand instead of `init`.
- `packages/cli/src/index.ts`: add `'setup'` case that imports and runs the new `runSetup` from `packages/cli/src/commands/setup.ts`.
- `.env.example`: add the missing vars actually used by tooling — `EMBEDDING_PROVIDER`, `OPENAI_API_KEY`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `SEED_DOCS_DIR`, `SEED_USER_ID`. Document each.
- `README.md`: replace the stale/broken setup section (it cites `src/env.ts`, `src/lib/http.ts`, `src/lib/config/schema.ts` — none exist) with the real `pnpm setup` one-command flow + the manual `.env.local` alternative.
- Fix the stale comment references in `config/app.config.ts:6` and `init.ts:91-93` pointing at the old `src/lib/config/schema.ts`.

---

## Commit 12 — `test: RAG pipeline integration + coverage gaps`

The reason the Commit-1 bug went undetected: **no test asserts chunks are persisted after ingest**, and the chat-route test mocks `searchChunks`.

- `packages/application/src/rag/__tests__/ingest.integration.test.ts`: drive `ingestFile` with a fake PDF/embeddings, assert `chunks.insertMany` was called with `{documentId, content, embedding}` tuples matching the embed output — fails on current code, passes after Commit 1.
- `search.ts` test (unguarded DB path), `parseQueryPagination` NaN test, `respond()` mapping test, `setUserRole` audit-action test.
- A prior version of this plan referenced a non-existent `docs/TECH_DEBT.md`. No such file was ever committed — the reference has been removed.

---

## What should NOT change
- The Clean Architecture layering or the `.dependency-cruiser` rules (they're the project's strength).
- The `Result` monad pattern or port/adapter boundaries.
- Clerk as the auth provider (only harden its use).
- Existing public API/route shapes (only error-response bodies get safer).

## Verification per commit
`pnpm typecheck && pnpm lint && pnpm arch && pnpm test && pnpm build` (the exact gate `docs/TECH_DESIGN.md` prescribes), plus the new end-to-end smoke in Commit 10.

## Risk notes
- Commit 3 (configurable dimension) requires a migration that changes `vector(768)`→`vector(N)`; on an existing populated DB this needs a re-index. The.prefs. The CLI will detect a non-empty `chunks` table and refuse/block with instructions rather than silently corrupt.
- This is large; each commit above is designed to be independently green so the PR can be stopped or reverted at any boundary. The commits are ordered so that dependencies (e.g., schema changes before setup wizard) are respected.
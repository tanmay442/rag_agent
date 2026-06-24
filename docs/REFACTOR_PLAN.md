# Refactor Plan: Bug Fixes + One-Command Setup CLI + Code Quality

One comprehensive PR on `main`, delivered as a sequence of focused commits. Ordered so each commit keeps the app buildable and the test suite green. I verified every finding against the actual source (file:line cited).

---

### Commit 1 — `fix(rag): persist embeddings in ingestFile (RAG was non-functional)`

**Root cause:** `packages/application/src/rag/ingest.ts:64` calls `await deps.embeddings.embedBatch(texts)` and discards the result. The `chunks` table is never written, so `searchChunks` always returns `[]`. The comment at `ingest.ts:75-77` claiming the documents adapter wraps a transaction is false (`repositories.ts:32` only inserts the document row). The chunk-insert wiring already exists but is dead code.

**Changes:**
- `packages/application/src/rag/ingest.ts`: add `chunks: ChunkRepository` to `IngestDeps`; capture `const embeddings = await deps.embeddings.embedBatch(texts)`; insert document first, then build `rows = texts.map((t,i) => ({ documentId: inserted.id, content: t, embedding: embeddings[i] }))` and `await deps.chunks.insertMany(rows)`. Update the misleading comment. Return real persisted count.
- `src/composition.ts:82-88`: add `chunks: chunkRepo` to `ingestDeps`.
- `packages/cli/src/commands/seed.ts:72-91`: add `chunks` to the inline `ingestDeps` (mirror `composition.ts`).
- **Replace-by logic stays transactional-safe:** move the `deleteById(existing.id)` to after successful re-ingest is not required (cascade handles chunks), but I'll insert-then-delete-old carefully — keep current delete-old-first since chunks cascade, but document the tradeoff.

**Why this is #1:** nothing else matters if retrieval is empty.

---

### Commit 2 — `fix(rag): guard vector search and parameterize the vector literal`

- `packages/application/src/rag/search.ts:40`: wrap `chunks.searchByVector` in try/catch → `ExternalServiceError` (currently unguarded → uncaught 500).
- `packages/infrastructure/src/db/repositories.ts:60-75`: validate `embedding` is a non-empty finite-number array before stringifying; pass the vector as a parameterized value. Keep the cosine-distance SQL but make the literal safe.

---

### Commit 3 — `feat(rag): configurable embedding provider and dimension`

Per your choice. Today `gemini-embedding-001` (768) is hardcoded (`google-embedding-service.ts:14`) and `schema-vector.ts:5` is fixed `vector(768)`.

**Changes:**
- `packages/domain/src/embedding-providers.ts` (new): a registry of known providers — `{ id, label, provider: 'google'|'openai', model, defaultDimension, envVar, providerOptions? }`. Seed with: Google `gemini-embedding-001` (768), OpenAI `text-embedding-3-small` (1536), OpenAI `text-embedding-3-large` (3072).
- `packages/infrastructure/src/llm/embedding-service.ts`: factory that reads `EMBEDDING_PROVIDER` (default `gemini`) + existing `AI_STUDIO_KEY` / new `OPENAI_API_KEY`, returns the `EmbeddingService` port and the active dimension.
- `schema-vector.ts`: accept a `dimension` param → `vector(dim)` factory function.
- `schema.ts:27`: `embedding: vector(getActiveDimension()).notNull()`.
- Composition + chat route use the factory. The config CLI writes `EMBEDDING_PROVIDER` and warns on dimension mismatch with an existing non-empty `chunks` table (re-index required).

---

### Commit 4 — `fix(db): correct drizzle config + enable pgvector migration`

- `drizzle.config.ts:6`: change `schema: './src/lib/db/schema.ts'` → `schema: './packages/infrastructure/src/db/schema.ts'` (the path the README/`db-migrate` assume but which doesn't exist — currently `db-migrate` silently finds zero tables).
- `drizzle/` new migration `0001_enable_pgvector.sql`: `CREATE EXTENSION IF NOT EXISTS vector;` (today pgvector must be enabled manually in Neon — no automation exists).
- `scripts/apply-migration.mjs`: ensure the extension SQL runs first.

---

### Commit 5 — `feat(api): respond() HTTP error mapper + consistent route handling`

The domain layer (`errors.ts:1-7`) documents a `respond()` helper in `src/lib/http.ts` that **doesn't exist** — every route hand-rolls `{ error: (err as Error).message }` status 500, leaking internal messages.

- `src/lib/http.ts` (new): `respond(result | error)` maps `DomainError` subclasses → their `.status` (already defined on each class), generic `Error` → 500 with a safe message, JSON `{ error, code }`.
- Convert admin routes to use it; stop echoing raw `.message` to clients.

---

### Commit 6 — `fix(api): validation, audit correctness, impersonation & upload hardening`

- `src/composition.ts:191-199` `parseQueryPagination`: add `Number.isFinite` guard → fall back to default (currently `?limit=foo` → `NaN` flows to the DB).
- **Audit semantics** (High): `packages/application/src/auth/users.ts:27` logs `action:'impersonation'` for role changes — wrong; add `role_change` to the `ticketAudit` CHECK and log correctly. `tickets.ts:71` always logs `status_change` — diff the patch and log `assign`/`note`/`status_change` appropriately. `documents.ts:122` audits *before* the delete — swap to act-then-audit.
- **Impersonation** (`src/app/api/admin/users/[clerkId]/impersonate/route.ts`): block self-impersonation and admin→admin.
- **Upload** (`src/app/(app)/admin/actions.ts:51`): replace extension-only check with `%PDF-` magic-byte validation; enforce size on the API route too (server action has it, raw API route doesn't).

---

### Commit 7 — `perf(db): indexes + debounce last-seen writes`

- `schema.ts`: add indexes — `documents(deleted_at)` + `documents(uploaded_at desc)` (every list/analytics call currently full-scans + sorts), `chunks(document_id)` (cascade + counts), `tickets(status)`.
- `packages/infrastructure/src/auth/session.ts:90`: debounce `touchLastSeen` (only write if `last_seen_at` older than ~60s) — today every authenticated request writes the `users` row.
- `getAnalyticsSummary`: stop fetching a useless row with `limit:0` (M3).

---

### Commit 8 — `refactor: decompose chat route handler` (TECH_DEBT #1)

Split `src/app/api/chat/route.ts` (284 lines, auth+ratelimit+parse+prefetch+streamText+tools+ticket-id-retry+citation-wrap) into `streamChatResponse()`, `buildChatTools()`, `emitCitations()` per the existing TECH_DEBT note. Fix the misleading "SELECT FOR UPDATE" comment (H8: there is none; the unique constraint is what actually serializes). Preserve all existing chat-route tests.

---

### Commit 9 — `refactor(cli): decompose runInit + safe config serialization`

- Split `packages/cli/src/commands/init.ts:133-284` `runInit` (152 lines) into `promptOrg`, `promptPersona`, `promptOutOfScope`, `promptAdmin`, `promptSeed`, `writeOutputs` (TECH_DEBT #6).
- Remove `process.exit(1)` inside the library path (`init.ts:238`) → throw, let the CLI entry decide. Makes the failure path unit-testable.
- Replace the regex JSON→TS serializer (`init.ts:292`) that mangles values containing `":` or backticks with a proper recursive serializer.

---

### Commit 10 — `feat(cli): one-command interactive setup` ⭐ (the headline feature)

Rebuild `rag-agent init` / `pnpm setup` into a true end-to-end first-run wizard. After `git clone` + `pnpm install`, **one command** sets up everything and validates it works.

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

Implementation: new `packages/cli/src/commands/setup.ts` orchestrating the decomposed steps; `init.ts` becomes the config-only subset. Update `.env.example` (Commit 11) so non-interactive users still have a reference. All secret writes use `0600`.

---

### Commit 11 — `chore: complete .env.example + README + add pnpm setup:env script`

- `.env.example`: add the missing vars actually used by tooling — `EMBEDDING_PROVIDER`, `OPENAI_API_KEY`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `SEED_DOCS_DIR`, `SEED_USER_ID`. Document each with the same table the explorer produced.
- `README.md`: replace the stale/broken setup section (it cites `src/env.ts`, `src/lib/http.ts`, `src/lib/config/schema.ts` — none exist) with the real `pnpm setup` one-command flow + the manual `.env.local` alternative.
- Fix the stale comment references in `config/app.config.ts:6` and `init.ts:91-93` pointing at the old `src/lib/config/schema.ts`.

---

### Commit 12 — `test: RAG pipeline integration + coverage gaps`

The reason the Commit-1 bug went undetected: **no test asserts chunks are persisted after ingest**, and the chat-route test mocks `searchChunks`.

- `packages/application/src/rag/__tests__/ingest.integration.test.ts`: drive `ingestFile` with a fake PDF/embeddings, assert `chunks.insertMany` was called with `{documentId, content, embedding}` tuples matching the embed output — fails on current code, passes after Commit 1.
- `search.ts` test (unguarded DB path), `parseQueryPagination` NaN test, `respond()` mapping test, `setUserRole` audit-action test.
- Mark `docs/TECH_DEBT.md` items #1 and #6 done with commit SHAs; correct the "Dead code: 0%" claim.

---

### What should NOT change
- The Clean Architecture layering or the `.dependency-cruiser` rules (they're the project's strength).
- The `Result` monad pattern or port/adapter boundaries.
- Clerk as the auth provider (only harden its use).
- Existing public API/route shapes (only error-response bodies get safer).

### Verification per commit
`pnpm typecheck && pnpm lint && pnpm arch && pnpm test && pnpm build` (the exact gate `docs/TECH_DESIGN.md` prescribes), plus the new end-to-end smoke in Commit 10.

### Risk notes
- Commit 3 (configurable dimension) requires a migration that changes `vector(768)`→`vector(N)`; on an existing populated DB this needs a re-index. The CLI will detect a non-empty `chunks` table and refuse/block with instructions rather than silently corrupt.
- This is large; I'll keep each commit independently green so we can stop or revert at any boundary.

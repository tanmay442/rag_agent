# Effect Migration Plan

## Goal

Migrate the `rag-support-agent` codebase from hand-rolled `Result<T,E>` +
`DomainError` + manual DI to **Effect** — the full library with `Effect<A,E,R>`,
`Context.Service`, `Layer`, `Schema.TaggedError`, `@effect/vitest`, and Effect
`Config`/`Logger`. Remove Zod entirely in favor of Effect `Schema`.

The migration is done in **8 sequential sessions**, each executed by one AI
agent. Every session ends with all 230+ tests passing, zero architecture
violations, and one git commit.

---

## How This Plan Works

You (the developer) give the agent **one session file at a time**. When the
agent finishes, it writes a handoff context file to
`docs/effect-migration/context/`. You then start the next agent, give it the
next session file **plus** the context file from the previous session. Repeat
until all 8 sessions are done.

```
Session 1 agent  ──works──►  writes context/after-session-01.md
                                      │
Session 2 agent  ◄──gets session-02.md + after-session-01.md
                   ──works──►  writes context/after-session-02.md
                                      │
Session 3 agent  ◄──gets session-03.md + after-session-02.md
                   ──works──►  writes context/after-session-03.md
                                      ...
Session 8 agent  ◄──gets session-08.md + after-session-07.md
                   ──works──►  informs the developer that all is complete
```

---

## Session Map

| Session | File | What it does | Key deps |
|---------|------|-------------|----------|
| 1 | `session-01-foundation.md` | Install `@effect/vitest`, `@effect/platform`, `@effect/platform-node`. Update `.dependency-cruiser.cjs` to allow `effect`/`@effect/*` everywhere, ban `zod`. Create branded IDs (`DocumentId`, `TicketId`, `ClerkUserId`, etc.). Update vitest config. | None |
| 2 | `session-02-domain-errors.md` | Replace `errors.ts` → `Schema.TaggedError`. Replace Zod schemas (`app-config.ts`, `request-schema.ts`) → Effect Schema. Remove `zod` from all package.json files. Update all error construction callsites. `Result<T,E>` stays for now. | Session 1 |
| 3 | `session-03-services-infra-db.md` | **The big type migration.** Ports → `Context.Service` with `Effect` return types. Convert all repositories + transaction runner to Effect. Remove `Result<T,E>` — use `Effect<A,E,R>` everywhere. Update all application use-cases, composition, routes, and tests to new types. | Sessions 1-2 |
| 4 | `session-04-infra-external.md` | Convert LLM, Auth, Blob Storage, Queue, Rate Limiter, Query Stats, PDF parsing, Text Splitter to proper Effect services with live layers. Create `AppConfig` service via Effect `Config`. | Session 3 |
| 5 | `session-05-application.md` | Refine all use-cases to proper `Effect.fn` + `Effect.gen` patterns. Remove `service-result.ts` entirely. Use `Effect.catchTag` for typed error handling. | Session 3 |
| 6 | `session-06-app-shell.md` | Rewrite `src/composition.ts` as full layer assembly. Convert all routes to `Effect.runPromise` boundaries. Convert server actions. Update `src/lib/http.ts`. Chat streaming with Effect orchestration. | Sessions 3-5 |
| 7 | `session-07-tests.md` | Convert all 26 test files to `@effect/vitest`. Use `it.effect`, `it.live`. Create test layers for all service mocks. Maintain 230 test equivalents. | Sessions 3-6 |
| 8 | `session-08-cleanup.md` | Replace logger with Effect `Logger`. Replace env validation with Effect `Config`. Update scripts and CLI. Remove all compat/legacy code. Docker + Vercel verification. Final validation. | All prior |

---

## Execution Order Rationale

1. **Session 1 (Foundation)** comes first — smallest diff, unblocks everything,
   no code changes beyond tooling config.
2. **Session 2 (Errors + Schema)** comes second — replaces error types and Zod.
   This is the first code-change session. `Result<T,E>` stays as a union type
   so everything still compiles. The error API changes (object-based
   constructors) but the structure is preserved.
3. **Session 3 (Services + Repositories + Result removal)** is the **largest
   session** — the fundamental type migration. Every port, every implementation,
   every use-case, every route, every test changes types. This session replaces
   the entire type system: `Result<T,E>` → `Effect<A,E,R>`, `Promise<T>` →
   `Effect<T,E,R>`, manual DI → `Context.Service` + `Layer`. All 230 tests pass
   after this session.
4. **Session 4 (External services)** completes the infrastructure layer — LLM,
   auth, storage, queue, config. These were left abstract in Session 3; now
   they get proper Effect implementations with live layers.
5. **Session 5 (Application)** refines use-cases to idiomatic Effect patterns.
   `service-result.ts` disappears. `Effect.fn` tracing is added.
6. **Session 6 (App shell)** wires everything together — composition as layer
   assembly, routes as Effect boundaries, http.ts error mapping.
7. **Session 7 (Tests)** converts the test suite to `@effect/vitest`. Tests are
   last because the test framework change is purely mechanical — the test logic
   and assertions were already updated in Sessions 2-6.
8. **Session 8 (Cleanup)** removes all legacy code (Zod, compat shims), updates
   logger/config/scripts, and verifies Docker/Vercel deployment.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Errors | `Schema.TaggedError` | Serializable, branded `_tag`, integrates with Effect Schema, pattern-matching |
| Schemas | Effect Schema (remove Zod) | One validation library; branded IDs require Schema |
| Branded IDs | `Schema.brand("XxxId")` | Prevents ID confusion at compile time |
| Result type | Removed → `Effect<A,E,R>` | Effect IS the result type — no need for a separate one |
| Services | `Context.Service` + `Layer` | Effect-native DI, testable via `Layer.provide`, memoized |
| Composition | Layer assembly (no more `bind()`) | All wiring in one place, testable by swapping layers |
| Routes | `Effect.runPromise` boundary | Next.js requires `Promise<Response>`, Effect runs internally |
| Config | Effect `Config` module | Type-safe env loading, defaults, redacted secrets |
| Logger | Effect `Logger` | Structured logging, level filtering, fiber-aware |
| Tests | `@effect/vitest` | `it.effect`, `it.live`, test layers, fiber failure reporting |

---

## What Stays Unchanged

- **4-layer Clean Architecture** (`packages/domain`, `application`,
  `infrastructure`, app shell) — structure preserved, Effect goes inside it.
- **`dependency-cruiser`** — updated to allow Effect but same enforcement pattern.
- **Drizzle ORM + pgvector + HNSW cosine index** — untouched.
- **Next.js 16 App Router** — same routes, same pages, same API.
- **Docker Compose** (pgvector + Ollama) — unchanged.
- **Dockerfile** — same multi-stage build, same `pnpm next build`.
- **Vercel deployment** — same `vercel.json`, same build output.
- **Clerk auth, Upstash Redis, QStash, S3/R2** — unchanged.
- **All 230 tests** — maintain equivalent logic and coverage throughout.
- **Front-facing UX** — same routes, same responses, same UI.
- **Developer onboarding** — same `.env.example`, same README Quick Start.

---

## Test Count Obligation

Every session **must** end with all tests passing. The test count must not
decrease from one session to the next. If a session removes or renames a test
functionality, the equivalent assertion must exist in another form.

Starting count: **230 tests** (27 files).

### Per-file test count breakdown

| File | Tests | Notes |
|------|-------|-------|
| `packages/application/src/__tests__/result.test.ts` | 4 | **Deleted in Session 3** — `ok`/`err`/`map`/`flatMap` are gone. Coverage moves to use-case tests that verify Effect compositions. |
| `packages/application/src/admin/__tests__/documents.test.ts` | 6 | |
| `packages/application/src/admin/__tests__/tickets.test.ts` | 13 | |
| `packages/application/src/auth/__tests__/users.test.ts` | 3 | |
| `packages/application/src/rag/__tests__/ingest.integration.test.ts` | 6 | |
| `packages/application/src/rag/__tests__/search.test.ts` | 2 | |
| `packages/infrastructure/src/llm/index.test.ts` | 7 | |
| `packages/infrastructure/src/queue/index.test.ts` | 3 | |
| `packages/infrastructure/src/auth/upstash-rate-limiter.test.ts` | 3 | |
| `packages/infrastructure/src/auth/upstash-query-stats.test.ts` | 4 | |
| `packages/cli/src/__tests__/init.test.ts` | 7 | |
| `src/__tests__/composition.test.ts` | 19 | **Updated in Session 6** — `parseQueryPagination`/`parsePageParam` change |
| `src/lib/__tests__/env.test.ts` | 9 | |
| `src/lib/__tests__/sanitize.test.ts` | 11 | Stays plain vitest (pure functions) |
| `src/lib/__tests__/http.test.ts` | 27 | |
| `src/app/api/chat/route.test.ts` | 15 | |
| `src/app/api/admin/ingest-worker/route.test.ts` | 10 | |
| `src/app/api/admin/audit/route.test.ts` | 6 | |
| `src/app/api/admin/tickets/[ticketId]/route.test.ts` | 8 | |
| `src/app/api/admin/users/[clerkId]/role/route.test.ts` | 5 | |
| `src/app/api/admin/documents/[id]/blob/route.test.ts` | 7 | |
| `src/app/(app)/admin/actions.test.ts` | 16 | |
| `src/proxy.test.ts` | 8 | Stays plain vitest (middleware, edge runtime) |
| `src/components/ChatInterface.test.tsx` | 6 | Stays plain vitest (React component) |
| `scripts/seed-docs.test.ts` | 8 | Stays plain vitest (scripts) |
| `scripts/apply-migration.test.ts` | 14 | Stays plain vitest (scripts) |
| `scripts/setup-test-db.test.ts` | 3 | Stays plain vitest (scripts) |
| **Total** | **230** | After S3 deletes `result.test.ts` (4 tests), equivalent Effect assertions must be added to use-case tests |

### Build verification

Sessions **3 and 6** change route handler signatures and composition wiring.
Run `pnpm build` (Next.js build) in these sessions in addition to the four
standard checks, to ensure Next.js can still produce output.

---

## Files in This Folder

```
docs/effect-migration/
├── README.md                          ← you are here
├── 00-handoff-protocol.md             ← context handoff rules
├── session-01-foundation.md           ← tooling, arch rules, branded IDs
├── session-02-domain-errors.md        ← Schema.TaggedError, Effect Schema, remove Zod
├── session-03-services-infra-db.md    ← Context.Service + repos + Result→Effect
├── session-04-infra-external.md       ← LLM, auth, storage, queue, config
├── session-05-application.md          ← use-cases → Effect.gen
├── session-06-app-shell.md            ← layers, routes, actions, http.ts
├── session-07-tests.md                ← @effect/vitest migration
├── session-08-cleanup.md              ← logger, config, scripts, Docker
└── context/                           ← agents write handoff notes here
    └── .gitkeep
```

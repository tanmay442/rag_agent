# Execution Plan: Serverless, Vercel-First, Portable RAG Agent

## Goal

Transform the `rag_agent` codebase into a fully serverless, auto-scaling,
provider-swappable application. Vercel is the default deploy target; the
architecture avoids Vercel-specific APIs so the same code runs on
Cloudflare Workers, Deno Deploy, or Netlify. No servers to manage.

## How This Plan Works

This plan is split into **8 sessions**, each executed by one AI agent
in sequence. You (the developer) give the agent **one session file at a
time**. When the agent finishes, it writes a handoff context file to
`docs/execution-plan/context/`. You then start the next agent, give it
the next session file **plus** the context file from the previous
session. Repeat until all 8 sessions are done. The last agent informs
you when everything is complete.

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

## Session Map

| Session | File | What it does | Key deps |
|---------|------|-------------|----------|
| 1 | `session-01-db-driver-swap.md` | Replace `pg` Pool with `@neondatabase/serverless`. Delete `sslmode` injection. Connectionless HTTP fetch, Edge-ready. | None |
| 2 | `session-02-llm-providers.md` | Add `EMBEDDING_PROVIDER` / `CHAT_PROVIDER` env switch. Google, OpenAI, Ollama adapters. Enables zero-key local testing. | Session 1 |
| 3 | `session-03-blob-storage.md` | Move PDF `bytea` blobs out of Postgres into object storage (R2/S3/filesystem). New `BlobStorage` port + 3 adapters + schema migration + backfill script. | Session 1 |
| 4 | `session-04-qstash-ingest.md` | Add QStash queue for async PDF ingest. Sync path for <4 MB, async for large PDFs. New `ingest-worker` route + `ingest_status` column. | Session 3 |
| 5 | `session-05-rate-limit-upstash.md` | Replace in-memory rate limiter + query stats with Upstash Redis. Correct behavior across N Vercel instances. | Session 1 |
| 6 | `session-06-auth-decoupling.md` | Move Clerk behind `SessionStore` port. `proxy.ts` dispatches via `AUTH_PROVIDER`. No second adapter yet — just the seam. | Session 1 |
| 7 | `session-07-env-validation.md` | Centralized env validation in `src/lib/env.ts` + `instrumentation.ts`. One actionable error listing all missing keys. | Sessions 1-6 |
| 8 | `session-08-docker-readme-final.md` | Docker Compose (pgvector + Ollama), Dockerfile, `.env.example` defaults, README 3-step Quick Start + "Getting your API keys" walkthrough, project rename to `rag-support-agent`, migrate-on-build. **Final agent informs the developer.** | Sessions 1-7 |

## Execution Order Rationale

1. **Session 1 (DB driver)** comes first — it's the smallest diff, the
   highest risk reduction, and unblocks everything serverless.
2. **Session 2 (LLM providers)** comes second — enables zero-key local
   testing via Ollama, which makes validating sessions 3-6 much easier.
3. **Session 3 (Blob storage)** is the largest diff and must come before
   Session 4 (QStash needs R2 for large PDFs).
4. **Session 4 (QStash)** depends on Session 3's blob store being in
   place.
5. **Sessions 5 and 6** (rate limit, auth) are independent of 3-4 and
   can be done in either order; they're placed here to keep the
   dependency chain linear.
6. **Session 7 (env validation)** must come after 1-6 so it knows every
   env var the prior sessions introduced.
7. **Session 8 (Docker + README + final)** wraps everything. It produces
   the 3-step Quick Start that only works if all prior sessions are
   done. This agent also informs the developer that the plan is
   complete.

## What Stays Unchanged

- The 4-layer Clean Architecture (`packages/domain`, `application`,
  `infrastructure`, `cli`) is **not flattened**. The port/adapter
  pattern is what makes provider-swap and platform-swap cheap.
- `dependency-cruiser` stays. Run `pnpm arch` after every session.
- `src/composition.ts` stays. It's the single wiring point, not a
  problem to eliminate.
- Drizzle ORM + pgvector + HNSW cosine index stays.
- The `Result<T, DomainError>` pattern and `src/lib/http.ts` error
  mapping stay.

## Git Commit Strategy

Every session produces **one commit** after validation passes.

- **Author**: `tanmay442 <goeltanmay442@gmail.com>` (via `--author` flag,
  do NOT change git config)
- **Format**: `(session-NN): <description>` + validation summary
- **Do NOT push** — the developer pushes when ready
- **Do NOT stage** handoff context files
  (`docs/execution-plan/context/` is in `.gitignore`)
- Session 1 adds `docs/execution-plan/context/` to `.gitignore`

See `00-handoff-protocol.md` for the full commit strategy.

## What Was Removed

The following redundant plan file was removed to avoid confusing AI
agents during execution:

- `proposedplan.md` (root) — superseded by this `docs/execution-plan/`
  folder. It contained the original proposal which has been refined
  into the 8-session execution plan above.

## Files in This Folder

```
docs/execution-plan/
├── README.md                          ← you are here
├── 00-handoff-protocol.md             ← how context handoff works
├── session-01-db-driver-swap.md
├── session-02-llm-providers.md
├── session-03-blob-storage.md
├── session-04-qstash-ingest.md
├── session-05-rate-limit-upstash.md
├── session-06-auth-decoupling.md
├── session-07-env-validation.md
├── session-08-docker-readme-final.md
└── context/                           ← agents write handoff notes here
    └── .gitkeep
```

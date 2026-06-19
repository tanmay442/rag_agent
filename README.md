# RAG Support Agent

Serverless AI customer support agent built on Next.js 16, the Vercel AI SDK
v6, and Drizzle ORM on Neon Serverless Postgres. Users sign in with
**Clerk** (Vercel Marketplace), ask questions in a chat UI, and receive
cited answers drawn from uploaded PDF documentation; when the agent
cannot find a match, it offers to open a support ticket. A separate
**admin console** lets staff upload, list, preview, replace, and
delete documents, manage users, and triage tickets. Retrieval is
tool-driven: the chat model calls a `searchDocumentation` tool when
it needs context (and may ask a clarifying question first). On the
first user turn the server also pre-fetches chunks server-side and
injects them into the system prompt, so the model has grounded
context even when it does not call the tool itself; the LLM may
still call `searchDocumentation` for reformulations. Tickets are
opened only when the user explicitly asks for one.

## Stack

- **Framework:** Next.js 16 (App Router) with Turbopack
- **Auth:** Clerk (`@clerk/nextjs` v7) via Vercel Marketplace; Next 16
  `proxy.ts` (the renamed `middleware.ts`) for route gating
- **LLM:** Google AI Studio `gemini-embedding-001` (free 768-dim
  embeddings) + any OpenAI-compatible chat endpoint via
  `CUSTOM_LLM_*` env vars
- **Database:** Neon Serverless Postgres with the `pgvector` extension
  and HNSW cosine index
- **ORM:** Drizzle
- **Tooling:** Vitest, Testing Library, Playwright, `drizzle-kit`

## Local development

```bash
# 1. Install
pnpm install

# 2. Copy env template
cp .env.example .env.local
# …then fill DATABASE_URL, AI_STUDIO_KEY, CUSTOM_LLM_*,
#    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, ADMIN_EMAILS

# 3. Apply schema + the new columns on pre-existing tables
node scripts/apply-migration.mjs

# 4. Seed sample docs (optional)
pnpm seed

# 5. Run the app
pnpm dev
```

The app boots on <http://localhost:3000>.

## Identity, auth, and roles

- **Provider:** Clerk (Vercel Marketplace). The integration auto-provisions
  `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- **Sign-in:** `/sign-in` and `/sign-up` use Clerk's hosted `<SignIn />` /
  `<SignUp />` components. Email+password and Google are enabled in the
  Clerk dashboard; the app is provider-agnostic.
- **Role model:** Every Clerk user has `publicMetadata.role` of `admin`
  or `user`. Clerk is the source of truth; a local `users` table mirrors
  the role for fast lookups.
- **Bootstrap:** `ADMIN_EMAILS` is a comma-separated env var. The first
  time a user with one of those emails signs in, they are auto-promoted
  to `admin` (both in Clerk's `publicMetadata` and in the local row).
  After that, admins promote others from `/admin/users`.
- **Route gating:** `src/proxy.ts` runs `clerkMiddleware`. `/chat(.*)`,
  `/admin(.*)`, `/api/chat(.*)`, and `/api/admin(.*)` require a signed-in
  user; `/admin(.*)` and `/api/admin(.*)` additionally require
  `role === 'admin'` (non-admins are redirected to `/chat`).
- **Action gating:** Every admin server action and API route calls
  `requireAdmin()` as its second line. Server actions return
  `{ error: 'Forbidden' }`; API routes return HTTP 403.

## Admin console

- **`/admin` (Overview)** — Counts of docs, chunks, tickets, open
  tickets, and users, plus the latest 10 audit events.
- **`/admin/upload`** — File picker. After a successful upload shows the
  chunk count and links to the new row in Documents.
- **`/admin/documents`** — Searchable, paginated table. Each row has
  *Preview* (inline iframe over `/api/admin/documents/[id]/blob`),
  *Download*, *Replace*, *Delete* (soft delete with 7-day restore
  window), and *Hard delete* (cascade).
- **`/admin/tickets`** — Searchable, paginated list. Each row opens a
  drawer with the full issue, a notes thread, a status select, an
  assignee select, and an "Add note" textarea. Status transitions are
  validated (no `closed → created/in_progress`).
- **`/admin/users`** — Searchable, paginated list of all Clerk users.
  Per-row *Promote / Demote* and *Impersonate* (issues a short-lived
  Clerk sign-in token and opens it in a new tab).
- **`/admin/analytics`** — Read-only counts and an in-process top-queries
  table.
- **`/admin/audit`** — Full audit log filterable by document id or
  ticket id.

## Rate limit

`src/lib/auth/ratelimit.ts` is a single-instance, in-memory LRU keyed
by `chat:${userId}`. Default budget: 30 requests / 60 s, max 5 000
keys, evicts the least-recently-touched. The 31st request returns
HTTP 429 with a `Retry-After` header. When the app moves to a
multi-region deployment, swap this for an Upstash hash; the call sites
do not need to change.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Run Next.js in dev mode |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit + integration suite |
| `pnpm test:ui` | Vitest with the interactive UI |
| `pnpm e2e` | Playwright smoke tests |
| `pnpm test:ci` | Full CI pipeline (setup → vitest → playwright → teardown) |
| `pnpm db:push` | Apply the Drizzle schema to the configured DB (interactive) |
| `pnpm db:generate` | Generate SQL migrations from `src/lib/db/schema.ts` |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm seed` | Ingest every PDF in `scripts/fixtures/` |
| `pnpm setup-test-db` | Provision a `dev-test` Neon branch and write `DATABASE_URL` to `.env.test` |
| `pnpm teardown-test-db` | Delete the `dev-test` branch |

For a non-interactive migration, run `node scripts/apply-migration.mjs`
directly. It plays the generated SQL plus the
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for the new
columns on the pre-existing `documents` and `tickets` tables.

## Tests

### Unit + integration (Vitest)

91 tests across 17 files. Run with `pnpm test` (single run) or
`pnpm test:ui` (interactive). Highlights:

- `src/lib/db/schema.test-d.ts` — Drizzle type inference
- `src/lib/rag/ingest.test.ts` — PDF → chunks → embed pipeline with
  mocked `embed` and `pdf-parse`
- `src/lib/rag/search.test.ts` — cosine similarity search with stubbed
  `db.execute`
- `src/lib/auth/users.test.ts` — Clerk-mirror `users` table, role
  transitions, pagination
- `src/lib/auth/ratelimit.test.ts` — 30 / 60 s budget, LRU eviction,
  429 surface
- `src/lib/auth/audit.test.ts` — audit row inserts (document + ticket)
- `src/lib/auth/query-stats.test.ts` — per-user top-queries counter
- `src/app/api/chat/route.test.ts` — 401 / 429 paths + tool wiring
- `src/app/api/admin/{users,documents,tickets}/...` — 403 / 400 / 404 /
  409 paths and the happy path
- `src/app/admin/actions.test.ts` — every admin server action 403s for
  non-admin and forwards the right shape on success
- `src/proxy.test.ts` — middleware route gating (public / signed-in /
  admin)

### E2E (Playwright)

`e2e/chat.spec.ts` asks a seeded question, asserts a citation, then
escalates to a ticket. `e2e/admin.spec.ts` covers the public-route
behaviour and the unauthenticated redirects from `/chat` and `/admin`.
The full auth-gated flow requires a configured Clerk project; tests
that need it are gated on `SKIP_AUTH_E2E=0`. The Playwright config
boots the dev server and runs `pnpm setup-test-db` as a global setup.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                 # RAG streaming + ticket tool (auth)
│   │   └── admin/                        # All admin API routes (auth + role)
│   ├── chat/page.tsx                     # Chat UI (auth)
│   ├── sign-in/[[...sign-in]]/page.tsx   # Clerk <SignIn /> card
│   ├── sign-up/[[...sign-up]]/page.tsx   # Clerk <SignUp /> card
│   ├── admin/                            # Admin pages (auth + role)
│   │   ├── layout.tsx                    # Side nav + requireAdmin()
│   │   ├── page.tsx                      # Overview
│   │   ├── actions.ts                    # All admin server actions
│   │   ├── upload/page.tsx
│   │   ├── documents/page.tsx
│   │   ├── documents/[id]/preview/page.tsx
│   │   ├── tickets/page.tsx
│   │   ├── users/page.tsx
│   │   ├── analytics/page.tsx
│   │   └── audit/page.tsx
│   ├── layout.tsx                        # ClerkProvider + Navigation
│   └── page.tsx                          # Landing (public)
├── components/
│   ├── ChatInterface.tsx                 # Streaming chat with citations
│   └── Navigation.tsx                    # Top nav (auth-aware server component)
├── lib/
│   ├── auth/                             # Clerk session + bootstrap + helpers
│   │   ├── session.ts
│   │   ├── users.ts
│   │   ├── ratelimit.ts
│   │   ├── query-stats.ts
│   │   └── audit.ts
│   ├── admin/                            # Admin reads + writes
│   │   ├── documents.ts
│   │   ├── tickets.ts
│   │   ├── analytics.ts
│   │   └── audit.ts
│   ├── chat/                             # UIMessage type
│   ├── db/                               # Drizzle schema + pg client
│   ├── llm/                              # Embedding + chat model factory
│   └── rag/                              # PDF ingest + cosine search
├── proxy.ts                              # clerkMiddleware (Next 16 convention)
└── …
scripts/
├── apply-migration.mjs                   # Non-interactive migrator
├── fixtures/                             # Seeded PDFs
├── make-sample-pdf.ts                    # Regenerates the handbook
├── make-portal-fixtures.ts               # Regenerates the topic PDFs
├── seed-docs.ts                          # CLI seeder
├── setup-test-db.ts                      # Per-run Neon branch
└── teardown-test-db.ts                   # Branch cleanup
```

### CI

`pnpm test:ci` runs the full pipeline:

1. `pnpm setup-test-db` — provision a `dev-test` Neon branch (skipped
   when `NEON_API_KEY` is not set)
2. `vitest run --reporter=dot` — unit + integration suite
3. `playwright test` — E2E smoke against a fresh dev server
4. `pnpm teardown-test-db` — delete the `dev-test` branch

Set `SKIP_E2E_SETUP=1` to skip the branch provisioning step in
environments where the DB is already seeded.

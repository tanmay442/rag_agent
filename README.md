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
- **UI:** Dark "obsidian slate" theme via CSS custom properties in `src/app/globals.css` (no light variant). Route groups split the app: `(marketing)` for the public landing, `(app)` for the unified sidebar + mobile-drawer shell that wraps `/chat` and `/admin/*`.

## Local development

```bash
# 1. Install
pnpm install

# 2. Copy env template
cp .env.example .env.local
# …then fill DATABASE_URL, AI_STUDIO_KEY, CUSTOM_LLM_*,
#    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, ADMIN_EMAILS

# 3. Apply schema + the new columns on pre-existing tables
pnpm cli db-migrate

# 4. Seed sample docs (optional)
pnpm cli seed

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
  window), and *Hard delete* (cascade). A page-level *Recount all*
  button re-derives every document's chunk count from the
  `chunks` table (the `recountAllChunksAction` server action).
- **`/admin/tickets`** — Searchable, paginated list. The table is
  `table-fixed` with bounded column widths and a compact
  `YYYY-MM-DD HH:mm` Created column so it never overflows the
  viewport — no horizontal page scroll. Each row links to
  `?ticket=…`, which a client-side overlay (`ticket-overlay.tsx`)
  reads via `useSearchParams` and renders the existing `TicketDrawer`
  body into a portal: the full issue, a notes thread, a status
  select, an assignee select, and an "Add note" textarea. Status
  transitions are validated (no `closed → created/in_progress`).
- **`/admin/users`** — Searchable, paginated list of all Clerk users.
  Per-row *Promote / Demote* and *Impersonate* (issues a short-lived
  Clerk sign-in token and opens it in a new tab).
- **`/admin/analytics`** — Read-only counts and an in-process top-queries
  table.
- **`/admin/audit`** — Full audit log filterable by document id or
  ticket id.

## Rate limit

`packages/application/src/auth/rate-limit.ts` is a single-instance,
in-memory LRU keyed by `chat:${userId}`. Default budget: 30 requests /
60 s, max 5 000 keys, evicts the least-recently-touched. The 31st
request returns HTTP 429 with a `Retry-After` header. When the app
moves to a multi-region deployment, swap this for an Upstash hash; the
call sites do not need to change.

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
| `pnpm db:generate` | Generate SQL migrations from `packages/infrastructure/src/db/schema.ts` |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm cli init` | Interactive first-time setup: org name, agent persona, admin emails, seed PDFs. Writes `config/app.config.ts` and re-seeds. |
| `pnpm cli seed` | Ingest every PDF in `scripts/fixtures/` |
| `pnpm cli db-migrate` | Apply the Drizzle schema + add-column migrations to the configured DB |
| `pnpm cli fixtures` | Manage PDF fixtures |
| `pnpm setup-test-db` | Provision a `dev-test` Neon branch and write `DATABASE_URL` to `.env.test` |
| `pnpm teardown-test-db` | Delete the `dev-test` branch |

## Tests

### Unit + integration (Vitest)

164 tests across 23 files (plus Playwright e2e when run with `pnpm test:ci`). Run with `pnpm test` (single run) or
`pnpm test:ui` (interactive). Highlights:

- `src/app/api/chat/route.test.ts` — 401 / 429 paths, the
  `searchDocumentation` and `createSupportTicket` tool wiring
  (searchChunks shape, 800-char cap, user-supplied limit, captured-
  citation emission), the Clerk identity override in
  `createSupportTicket`, and the first-turn pre-fetch (no header on
  empty `lastUserText`, chunks injected on the first turn,
  pre-fetched chunks surface as `data-citation` parts without a
  tool call, no pre-fetch on follow-up turns)
- `src/app/api/admin/documents/[id]/blob/route.test.ts` —
  inline PDF preview route (auth + content-type + 404 paths)
- `src/app/api/admin/tickets/[ticketId]/route.test.ts` —
  single-ticket GET/PATCH (auth + 404 + status validation)
- `src/app/api/admin/users/[clerkId]/role/route.test.ts` —
  role update route (auth + invalid role + forbidden)
- `src/components/ChatInterface.test.tsx` — chat frame layout
  (`flex-1 min-h-0 overflow-y-auto`) + streaming / citations
  rendering
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

<p align="center">
  <a href="public/SysArch.png">
    <img src="public/SysArch.png" alt="RAG Support Agent — System Architecture" width="100%" />
  </a>
</p>

> End-to-end view: the four lanes (Client → Edge/Proxy → Next.js Server → Neon Postgres) and the cross-lane flows (request, data/SQL, UI message stream, auth/JWT) that connect them. See the full breakdown below.

```
src/
├── app/
│   ├── (marketing)/        # Public landing (no app chrome)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── (app)/              # Authenticated shell (sidebar + mobile drawer)
│   │   ├── layout.tsx
│   │   ├── chat/page.tsx
│   │   └── admin/          # requireAdmin() guard + admin pages + actions
│   ├── api/{chat,admin}/   # Tool-driven RAG + admin API routes
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── sign-up/[[...sign-up]]/page.tsx
│   ├── layout.tsx          # ClerkProvider, html/body, fonts
│   └── globals.css         # Dark "obsidian slate" CSS tokens
├── components/
│   ├── ChatInterface.tsx
│   ├── app/AppSidebar.tsx  # Unified sidebar + mobile drawer (Client)
│   ├── landing/            # LandingHeader, LandingCard, LandingFooter
│   └── icons/GithubIcon.tsx
├── lib/http.ts             # respond() helper — maps DomainError → HTTP status
├── lib/config/             # App-level config types
├── proxy.ts                # clerkMiddleware (Next 16 convention)
└── …
scripts/                   # setup, seed, e2e fixtures
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

## Workspace layout

The business logic has been split into a 4-layer Clean Architecture
inside `packages/`:

```
packages/
├── domain/         # @app/domain — pure types, Zod schemas,
│                   #   Result<T,E>, DomainError hierarchy
├── application/    # @app/application — use-cases + port
│                   #   interfaces. Returns Result<T, DomainError>.
├── infrastructure/ # @app/infrastructure — Drizzle repos, AI SDK
│                   #   adapters, Clerk session, pdf-parse, bytea
├── cli/            # @app/cli — `rag-agent` sub-commands:
│                   #   init, seed, fixtures, db-migrate
└── pulsar-content/ # @app/pulsar-content — PDF fixtures + render-pdf
```

`src/` is the Next.js app shell. `src/composition.ts` is the only
place where adapters are instantiated; routes import from
`@/composition` and call the use-cases.

### Layer rules (enforced by `pnpm lint:arch`)

| Layer            | May import                                | May NOT import                |
|------------------|-------------------------------------------|-------------------------------|
| `domain`         | zod                                       | application, infrastructure, cli, pulsar-content, src/, drizzle, @ai-sdk, pdf-parse, next, node: built-ins |
| `application`    | domain, its own port interfaces           | infrastructure, src/app, src/components, drizzle, @ai-sdk, pdf-parse, next |
| `infrastructure` | domain, application, drizzle, @ai-sdk, clerk, pdf-parse, pg, pdf-lib | src/app, src/components, next |
| `src/app`, `src/components` | application, domain, src/lib/http, src/lib/config | drizzle, @ai-sdk, pdf-parse, infrastructure |
| `cli`            | application, pulsar-content, infrastructure, dotenv | src/app, src/components |
| `pulsar-content` | pdf-lib                                   | any other internal package |

Run `pnpm lint:arch` after any change that touches the import graph.

### Boundary validation

Every route handler and server action parses its external input
through a Zod schema before it reaches a use-case:

- `src/env.ts` — `process.env` validated at server start
- `src/app/api/chat/request-schema.ts` — POST `/api/chat` body
- `src/app/api/admin/*/route.ts` — request bodies and URL params
- Server actions in `src/app/(app)/admin/actions.ts` — form input

Use-cases return `Result<T, DomainError>`; `src/lib/http.ts` exports
`respond(result)` which maps `DomainError` to the right HTTP status
(ValidationError → 400, UnauthorizedError → 401, ForbiddenError → 403,
NotFoundError → 404, ConflictError → 409, GoneError → 410,
RateLimitedError → 429 with `Retry-After`, ExternalServiceError → 502).

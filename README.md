# RAG Support Agent

Serverless AI customer support agent built on Next.js 16, the Vercel AI SDK
v6, and Drizzle ORM on Neon Serverless Postgres. Users ask questions in a
chat UI and receive cited answers drawn from uploaded PDF documentation;
when the agent cannot find a match, it offers to open a support ticket.

The app does **not** ship authentication — it's intended to be embedded
inside a host site that already owns its user identity. The host should
forward the active user id (and any other necessary details) via a header
or shared session before calling into this service. See "Identity" below.

## Stack

- **Framework:** Next.js 16 (App Router)
- **LLM:** Google AI Studio `text-embedding-004` (free 768-dim embeddings)
  + any OpenAI-compatible chat endpoint via `CUSTOM_LLM_*` env vars
- **Database:** Neon Serverless Postgres with the `pgvector` extension and
  HNSW cosine index
- **ORM:** Drizzle
- **Tooling:** Vitest, Testing Library, Playwright, `drizzle-kit`

## Local development

```bash
# 1. Install
pnpm install

# 2. Copy env template
cp .env.example .env.local
# …then fill DATABASE_URL, AI_STUDIO_KEY, CUSTOM_LLM_*

# 3. Apply schema
pnpm db:push

# 4. Seed sample docs (optional)
pnpm seed

# 5. Run the app
pnpm dev
```

The app boots on <http://localhost:3000>.

## Identity

Tickets and uploaded documents record a `userId` for audit purposes, but
the app has no concept of a user session of its own. Until the host site
wires through its own identity, every record is tagged with the placeholder
`DEFAULT_USER_ID = "anonymous"` from `src/lib/auth/session.ts`. Change
that constant (or replace the `getSession()` shim with one that reads
the host's user info) once the integration is in place.

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
| `pnpm db:push` | Apply the Drizzle schema to the configured DB |
| `pnpm db:generate` | Generate SQL migrations from `src/lib/db/schema.ts` |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm seed` | Ingest every PDF in `scripts/fixtures/` |
| `pnpm setup-test-db` | Provision a `dev-test` Neon branch and write `DATABASE_URL` to `.env.test` |
| `pnpm teardown-test-db` | Delete the `dev-test` branch |

## Tests

### Unit + integration (Vitest)

Co-located next to each feature. Run with `pnpm test` (single run) or
`pnpm test:ui` (interactive). Highlights:

- `src/lib/db/schema.test-d.ts` — drizzle type inference
- `src/lib/rag/ingest.test.ts` — PDF → chunks → embed pipeline with mocked `embed` and `pdf-parse`
- `src/lib/rag/search.test.ts` — cosine similarity search with stubbed `db.execute`
- `src/app/api/chat/route.test.ts` — `/api/chat` route via `next-test-api-route-handler`
- `src/components/ChatInterface.test.tsx` — citation card rendering

### E2E (Playwright)

`e2e/chat.spec.ts` asks a seeded question, asserts a citation, then
escalates to a ticket. The Playwright config boots the dev server and
runs `pnpm setup-test-db` as a global setup.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   └── chat/route.ts                 # RAG streaming + ticket tool
│   ├── chat/page.tsx                     # Chat UI
│   ├── admin/
│   │   ├── actions.ts                    # uploadPdfAction
│   │   ├── layout.tsx                    # Admin shell
│   │   └── upload/page.tsx               # PDF upload
│   ├── layout.tsx
│   └── page.tsx                          # Landing
├── components/
│   ├── ChatInterface.tsx                 # Streaming chat with citations
│   └── Navigation.tsx                    # Top nav
├── lib/
│   ├── auth/                             # Default-user shim (no auth provider)
│   ├── chat/                             # UIMessage type
│   ├── db/                               # Drizzle schema + pg client
│   ├── llm/                              # Embedding + chat model factory
│   └── rag/                              # PDF ingest + cosine search
└── …
scripts/
├── fixtures/sample.pdf                   # Seeded handbook
├── make-sample-pdf.ts                    # Regenerates the fixture
├── seed-docs.ts                          # CLI seeder
├── setup-test-db.ts                      # Per-run Neon branch
└── teardown-test-db.ts                   # Branch cleanup
```

### CI

`pnpm test:ci` runs the full pipeline:

1. `pnpm setup-test-db` — provision a `dev-test` Neon branch (skipped when
   `NEON_API_KEY` is not set)
2. `vitest run --reporter=dot` — unit + integration suite
3. `playwright test` — E2E smoke against a fresh dev server
4. `pnpm teardown-test-db` — delete the `dev-test` branch

Set `SKIP_E2E_SETUP=1` to skip the branch provisioning step in
environments where the DB is already seeded.

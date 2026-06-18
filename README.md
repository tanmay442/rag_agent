# RAG Support Agent

Serverless AI customer support agent built on Next.js 16, the Vercel AI SDK
v6, Drizzle ORM, and Neon (Postgres + Auth). Users ask questions in a chat UI
and receive cited answers drawn from uploaded PDF documentation; when the
agent cannot find a match, it offers to open a support ticket.

## Stack

- **Framework:** Next.js 16 (App Router) with the new `proxy.ts` convention
- **LLM:** Google AI Studio `text-embedding-004` (free 768-dim embeddings)
  + any OpenAI-compatible chat endpoint via `CUSTOM_LLM_*` env vars
- **Database:** Neon Serverless Postgres with the `pgvector` extension and
  HNSW cosine index
- **ORM:** Drizzle
- **Auth:** Neon Auth (Better Auth) with role-based access control
- **Tooling:** Vitest, Testing Library, Playwright, `drizzle-kit`

## Local development

```bash
# 1. Install
pnpm install

# 2. Copy env template
cp .env.example .env.local
# …then fill DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET,
#    AI_STUDIO_KEY, CUSTOM_LLM_*, ADMIN_EMAILS

# 3. Apply schema
pnpm db:push

# 4. Seed sample docs (optional)
pnpm seed

# 5. Run the app
pnpm dev
```

The app boots on <http://localhost:3000>. The `ADMIN_EMAILS` env var is a
comma-separated list; emails matching an entry are auto-promoted to the
`admin` role when they sign up.

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
- `src/proxy.test.ts` — session and admin RBAC redirects
- `src/components/ChatInterface.test.tsx` — citation card rendering
- `src/app/admin/actions.test.ts` — admin-only server actions
- `src/app/signup/signup.test.ts` — admin bootstrap

### E2E (Playwright)

`e2e/chat.spec.ts` signs in, asks a seeded question, asserts a citation,
then escalates to a ticket. The Playwright config boots the dev server
and runs `pnpm setup-test-db` as a global setup.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...neonAuth]/route.ts   # Better Auth catch-all
│   │   └── chat/route.ts                 # RAG streaming + ticket tool
│   ├── chat/page.tsx                     # Auth-gated chat UI
│   ├── login/page.tsx                    # Sign-in form
│   ├── signup/page.tsx                   # Sign-up form
│   ├── admin/
│   │   ├── actions.ts                    # uploadPdfAction, setRoleAction
│   │   ├── layout.tsx                    # Admin-only layout
│   │   ├── upload/page.tsx               # PDF upload
│   │   └── users/page.tsx                # Role management
│   ├── layout.tsx
│   └── page.tsx                          # Landing
├── components/
│   ├── ChatInterface.tsx                 # Streaming chat with citations
│   ├── Navigation.tsx                    # Top nav
│   └── SignOutButton.tsx
├── lib/
│   ├── auth/                             # Neon Auth wrappers + role bootstrap
│   ├── chat/                             # UIMessage type
│   ├── db/                               # Drizzle schema + pg client
│   ├── llm/                              # Embedding + chat model factory
│   └── rag/                              # PDF ingest + cosine search
├── proxy.ts                              # Auth + admin RBAC for Next 16
└── …
scripts/
├── fixtures/sample.pdf                   # Seeded handbook
├── make-sample-pdf.ts                    # Regenerates the fixture
├── seed-docs.ts                          # CLI seeder
├── setup-test-db.ts                      # Per-run Neon branch
└── teardown-test-db.ts                   # Branch cleanup
```

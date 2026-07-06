# Session 08: Docker Compose + Dockerfile + README + Migrate-on-Build (FINAL)

## Objective

Create the developer-experience layer on top of Sessions 1-7:
- `docker-compose.yml` with Postgres+pgvector and optional Ollama
- `Dockerfile` for non-Vercel serverless platforms
- `.env.example` with sane defaults that boot against Docker
- `README.md` with a dead-simple 3-step Quick Start at the top, plus a
  detailed "Getting your API keys" section with sign-up links, free-tier
  notes, and dashboard walkthroughs for every service
- Rename the project from `rag_agent` to `rag-support-agent` (kebab-case
  for display, package name stays valid)
- Migrate-on-build so `pnpm build` runs migrations automatically
- `output: 'standalone'` in `next.config.ts` for the Docker image

**This is the final session. When complete, inform the developer that
the entire plan is done.**

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
docker --version        # needed to test docker-compose
docker compose version  # needed to test docker-compose
```

If Docker is not available, you can still implement the files but
cannot validate the Docker Compose flow. Inform the developer.

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-07.md` first. Also
read ALL prior handoff files (`after-session-01.md` through
`after-session-07.md`) to compile the complete picture. Key things to
know from each session:

- **Session 1**: DB driver is `@neondatabase/serverless`. No `sslmode`
  injection. `DATABASE_URL` works with plain `postgres://` for local
  Docker.
- **Session 2**: `EMBEDDING_PROVIDER` / `CHAT_PROVIDER` env vars.
  Ollama works for zero-key local testing.
- **Session 3**: `BLOB_STORAGE_PROVIDER` env var. Filesystem adapter
  for local dev. `documents.storage_key` replaces `documents.blob`.
- **Session 4**: `QSTASH_TOKEN` env var (optional). Sync path for
  small PDFs, async for large. `documents.ingest_status` column.
- **Session 5**: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
  env vars (optional). In-memory fallback for local dev.
- **Session 6**: `AUTH_PROVIDER` env var (default `clerk`). Clerk
  behind adapter factory.
- **Session 7**: Centralized env validation in `src/lib/env.ts`.
  `instrumentation.ts` at project root.

### Files to Read First

- `README.md` — current Quick Start (lines 35-69), Manual setup, Stack
- `.env.example` — current template
- `next.config.ts` — current config (no `output: 'standalone'`)
- `package.json` — current scripts
- `vercel.json` — current Vercel config
- `drizzle.config.ts` — migration config
- `src/lib/env.ts` — complete env var list (from Session 7)

---

## Implementation

### 1. Create `docker-compose.yml` (project root)

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: ragagent
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  # Optional: zero-key local LLM via Ollama
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama:/root/.ollama
    profiles: ["ollama"]  # Only starts with `docker compose --profile ollama up`

volumes:
  pgdata:
  ollama:
```

The `ollama` service uses a Docker Compose profile so it's opt-in:
```bash
docker compose up -d db                              # just Postgres
docker compose --profile ollama up -d                # Postgres + Ollama
```

### 2. Create `Dockerfile` (project root)

Multi-stage build for non-Vercel serverless platforms:

```dockerfile
# Stage 1: Install dependencies
FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-slim AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/*/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3: Runtime
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### 3. Update `next.config.ts`

Add `output: 'standalone'`:

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // <-- new
  poweredByHeader: false,
  // ... rest unchanged
};
```

Vercel ignores `output: 'standalone'` (it uses its own build). This
only affects the Docker image.

### 4. Create `scripts/migrate.ts`

```typescript
import 'dotenv/config';
import { execSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Cannot run migrations.');
  process.exit(1);
}

try {
  console.log('Running migrations...');
  execSync('pnpm drizzle-kit migrate', { stdio: 'inherit' });
  console.log('Migrations complete.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
```

### 5. Update `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "tsx scripts/migrate.ts && next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:watch": "vitest",
    "test:ci": "bash -c \"tsx scripts/setup-test-db.ts && trap \\\"tsx scripts/teardown-test-db.ts\\\" EXIT; vitest run --reporter=dot\"",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:migrate": "tsx scripts/migrate.ts",
    "seed": "tsx scripts/seed-docs.ts",
    "setup-test-db": "tsx scripts/setup-test-db.ts",
    "teardown-test-db": "tsx scripts/teardown-test-db.ts",
    "typecheck": "tsc --noEmit",
    "configure": "tsx packages/cli/src/index.ts setup",
    "cli": "tsx packages/cli/src/index.ts",
    "arch": "dependency-cruiser --config .dependency-cruiser.cjs packages src",
    "dev:db": "docker compose up -d db",
    "dev:ollama": "docker compose --profile ollama up -d ollama"
  }
}
```

Key changes:
- `"build"`: now runs `tsx scripts/migrate.ts && next build` (migrate
  before build)
- `"db:migrate"`: new script
- `"dev:db"`: new convenience script for `docker compose up -d db`
- `"dev:ollama"`: new convenience script for starting Ollama

### 6. Update `.env.example`

Rewrite with sane defaults for local Docker:

```bash
# Copy to .env.local and fill in real values.
# Defaults below boot against `docker compose up -d db` with zero
# external API keys (using Ollama for LLM).

# 1. Database
#    Uses local Docker Postgres. For Vercel, use your Neon URL.
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ragagent

# 2. Embedding provider: google | openai | ollama (default: google)
#    For zero-key local dev, use ollama:
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
#    For production (Google):
# EMBEDDING_PROVIDER=google
# AI_STUDIO_KEY=
#    For OpenAI-compatible:
# EMBEDDING_PROVIDER=openai
# OPENAI_EMBEDDING_API_KEY=
# OPENAI_EMBEDDING_BASE_URL=
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small

EMBEDDING_DIMENSION=768

# 3. Chat provider: openai | google | ollama (default: openai)
#    For zero-key local dev, use ollama:
CHAT_PROVIDER=ollama
OLLAMA_CHAT_MODEL=llama3.1
#    For production (OpenAI-compatible):
# CHAT_PROVIDER=openai
# CUSTOM_LLM_API_KEY=
# CUSTOM_LLM_BASE_URL=
# LLM_MODEL=custom-chat-model

# 4. Blob storage: filesystem | r2 | s3 (default: filesystem)
BLOB_STORAGE_PROVIDER=filesystem
BLOB_FS_DIR=./.blobs
#    For production (Cloudflare R2):
# BLOB_STORAGE_PROVIDER=r2
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET=

# 5. Auth: clerk (only supported provider currently)
AUTH_PROVIDER=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# 6. Rate limiting + query stats (optional, for multi-instance)
#    Without these, in-memory adapters are used (fine for local dev).
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

# 7. Async ingest queue (optional, for large PDFs)
#    Without these, all uploads are synchronous.
# QSTASH_TOKEN=
# QSTASH_CURRENT_SIGNING_KEY=
# QSTASH_NEXT_SIGNING_KEY=
# QSTASH_INGEST_WORKER_URL=

# 8. Neon project management (optional, for CI test branches)
# NEON_API_KEY=
# NEON_PROJECT_ID=

# 9. Seed script config (optional)
SEED_DOCS_DIR=./documents
SEED_USER_ID=seed-script

# 10. Admin bootstrap (optional)
#     Comma-separated list of emails.
ADMIN_EMAILS=

# 11. Logging (optional)
#     One of: error, warn, info, debug. Default: info.
LOG_LEVEL=info
```

### 7. Rewrite `README.md`

Replace the top section (lines 1-69) with a 3-step Quick Start. Keep
the detailed sections below as "Reference".

```markdown
# RAG Support Agent

Serverless AI customer support agent built on Next.js 16, the Vercel AI
SDK v6, and Drizzle ORM on Neon Serverless Postgres with pgvector.
Users sign in with Clerk, ask questions in a chat UI, and receive
cited answers drawn from uploaded PDF documentation.

## Quick start

```bash
git clone <repo-url> && cd rag_agent
docker compose up -d db          # Postgres + pgvector
pnpm install && pnpm dev         # http://localhost:3000
```

That's it. The defaults in `.env.example` boot against the Docker
Postgres with Ollama for embeddings and chat — no external API keys
needed for local development.

> **Note:** You still need Clerk keys for auth (`CLERK_SECRET_KEY` and
> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`). Copy `.env.example` to
> `.env.local` and add them. Without Clerk, the app boots but you
> can't sign in.

### Zero-key local (with Ollama)

```bash
docker compose --profile ollama up -d   # Postgres + Ollama
# Pull the models (first time only):
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3.1
pnpm install && pnpm dev
```

### Deploy to Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add environment variables from `.env.example` — see the
   "Getting your API keys" section below for where to get each one.
4. Deploy. Migrations run automatically during `pnpm build`.

### Getting your API keys

Every service the app needs is listed below, with where to sign up,
what to copy, and free-tier notes. For local-only development you can
skip every service except **Clerk** — Docker provides Postgres and
Ollama replaces the LLM providers.

| Service | Required for | Where to sign up | Free tier |
|---------|-------------|------------------|-----------|
| Clerk | Auth (always) | https://dashboard.clerk.com | Yes — generous free tier |
| Neon | Prod DB | https://neon.tech | Yes — 0.5 GB, auto-suspend |
| Google AI Studio | Prod embeddings | https://aistudio.google.com/apikey | Yes — free embeddings |
| OpenAI-compatible chat | Prod chat | Your provider (OpenAI, OpenRouter, Groq, etc.) | Varies |
| Cloudflare R2 | Prod blob storage | https://dash.cloudflare.com → R2 | Yes — 10 GB, zero egress |
| Upstash Redis | Prod rate limiting | https://console.upstash.com | Yes — 10k commands/day |
| Upstash QStash | Async ingest (optional) | https://console.upstash.com → QStash | Yes — 500 msgs/day |

#### Clerk (auth — always required, even locally)

1. Go to https://dashboard.clerk.com → **Create application**.
2. Name it (e.g. "RAG Support Agent"). Select your preferred sign-in
   methods (Email + Google at minimum).
3. From the application's **API Keys** page, copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — starts with `pk_test_`
     (development) or `pk_live_` (production). The `NEXT_PUBLIC_`
     prefix means it's safe to expose to the client.
   - `CLERK_SECRET_KEY` — starts with `sk_test_` or `sk_live_`. **Never
     commit this.**
4. **Set up the JWT template (required for the role fast-path in
   `proxy.ts`)**: Dashboard → **Sessions** → **Customize session token**
   → set the template body to:
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```
   This projects `publicMetadata.role` into the session token's
   `metadata.role` claim, which the middleware reads without calling
   the Clerk Backend SDK on every request.
5. **For Vercel Marketplace auto-provision** (optional but convenient):
   In the Vercel dashboard → Storage → Marketplace → add Clerk. This
   auto-sets both keys in your Vercel project env vars.

#### Neon (prod database)

1. Go to https://neon.tech → **Sign up** (GitHub/Google).
2. **Create a project** → name it → select the region closest to your
   Vercel deployment region (e.g. `us-east-1` if Vercel is `iad1`).
3. Copy the **pooled connection string** (uses port `6543`, hostname
   `-pooler`); this goes into `DATABASE_URL`. It should end with
   `?sslmode=require`.
4. **Enable pgvector**: open the Neon SQL editor and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
5. For preview deploys: copy `NEON_API_KEY` (Settings → API keys) and
   `NEON_PROJECT_ID` (Settings → Project ID). When both are in Vercel
   env vars, `pnpm test:ci` provisions a per-branch Neon database for
   each Vercel preview deploy.

#### Google AI Studio (prod embeddings)

1. Go to https://aistudio.google.com/apikey → **Create API key**.
2. Copy the key into `AI_STUDIO_KEY`.
3. The default model `gemini-embedding-001` produces 768-dim vectors —
   matches the pgvector column. Don't change `EMBEDDING_DIMENSION`
   unless you switch to a different embedding model.

#### OpenAI-compatible chat (prod chat)

The app uses `@ai-sdk/openai`'s `createOpenAI`, so any
OpenAI-compatible endpoint works (OpenAI, OpenRouter, Groq, Together,
local LM Studio, etc.).

1. Get an API key from your provider.
2. Set `CUSTOM_LLM_API_KEY` = the key.
3. Set `CUSTOM_LLM_BASE_URL` = the endpoint (e.g.
   `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`).
4. Set `LLM_MODEL` = the model id (e.g. `gpt-4o-mini`,
   `anthropic/claude-3.5-sonnet` for OpenRouter).

#### Cloudflare R2 (prod blob storage)

1. Go to https://dash.cloudflare.com → **R2 Object Storage** (sign up
   if needed; requires a Cloudflare account + payment method on file
   even for the free tier).
2. **Create a bucket** — name it (e.g. `rag-agent-docs`). Note the
   region (auto is fine).
3. **Create an API token**: R2 → **Manage R2 API Tokens** → **Create
   API Token** → permissions: **Object Read & Write** on your bucket.
   Copy:
   - `R2_ACCESS_KEY_ID` — the access key id
   - `R2_SECRET_ACCESS_KEY` — the secret access key
4. `R2_ACCOUNT_ID` = your Cloudflare account ID (visible in the
   dashboard sidebar or URL).
5. `R2_BUCKET` = the bucket name you created.
6. **CORS** (needed if the PDF preview route redirects to a signed
   R2 URL that the browser fetches): R2 → your bucket → **Settings** →
   **CORS Policy** → add:
   ```json
   [{
     "AllowedOrigins": ["https://your-app.vercel.app", "http://localhost:3000"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["Content-Length", "Content-Type"],
     "MaxAgeSeconds": 3600
   }]
   ```
7. If the CSP in `next.config.ts` blocks the R2 domain in `frame-src`
   or `img-src`, add `https://*.r2.dev` (or your custom R2 domain) to
   those directives.

#### Upstash Redis (prod rate limiting + query stats)

1. Go to https://console.upstash.com → **Create Database**.
2. Name it, select the **same region** as your Vercel deployment
   (latency matters — every `/api/chat` call hits Redis).
3. Copy:
   - `UPSTASH_REDIS_REST_URL` — the REST URL (ends with `.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` — the REST token
4. Without these, the app falls back to in-memory rate limiting — fine
   for local dev, but on Vercel each instance gets its own limit (N×
   the intended budget). Set these for any multi-instance deploy.

#### Upstash QStash (async ingest — optional)

1. Go to https://console.upstash.com → **QStash**.
2. Copy:
   - `QSTASH_TOKEN` — from the QStash dashboard
   - `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` —
     from **Settings** → **API Keys**. These two are used for
     signature rotation; the worker verifies with both so a key
     rotation doesn't break in-flight messages.
3. Set `QSTASH_INGEST_WORKER_URL` = the public URL of your deployment
   (e.g. `https://your-app.vercel.app`). QStash calls back over the
   public internet, so localhost won't work — use a Vercel preview or
   production URL.
4. Without `QSTASH_TOKEN`, all uploads go through the synchronous path
   (≤4 MB, blocks until ingest completes). Fine for small docs.

## Stack

[... keep the existing Stack section ...]

## Reference

[... keep all existing detailed sections (Identity, Admin console, Rate
limit, Shared utilities, Scripts, Tests, Architecture, etc.) below the
Quick Start, under a "Reference" heading ...]
```

Key changes to README:
- 3-step Quick Start at the very top (clone, docker, install+dev)
- "Zero-key local" callout with Ollama
- "Deploy to Vercel" section (4 steps, references the API keys section)
- **"Getting your API keys" section** — one table + one subsection per
  service with where to sign up, what to copy, free-tier notes, and
  dashboard walkthroughs (Clerk JWT template, Neon pgvector extension,
  R2 CORS, Upstash region matching, QStash signing keys)
- Move existing detailed content under a "Reference" heading
- Remove the old "Quick start (recommended)" and "Manual setup" sections
  (replaced by the new Quick Start)
- Keep `pnpm configure` mention in the Scripts table (it still works,
  just not the primary path)

### 8. Update `vercel.json`

The current `vercel.json` is fine. No changes needed:
```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile"
}
```

The `buildCommand` runs `pnpm build` which now includes the migration
step (from `package.json` `"build": "tsx scripts/migrate.ts && next
build"`).

### 9. Add `.dockerignore`

```
node_modules
.next
.git
.env.local
.env.test
.blobs
documents
drizzle
```

### 10. Rename the project

Rename the project from `rag_agent` (snake_case) to
**`rag-support-agent`** (kebab-case) for display consistency in the
README, Docker image, and Vercel project name. npm package names must
be lowercase, so kebab-case is the convention.

**What to change:**

1. **`package.json`** line 2: `"name": "rag_agent"` →
   `"name": "rag-support-agent"`. The `name` field must be lowercase
   and kebab-case per npm rules.
2. **`README.md`** H1 heading: `# RAG Support Agent` (already correct
   in the rewrite above — just confirm it).
3. **`docker-compose.yml`** — the `container_name` is not set, so
   Compose derives it from the project directory name. No change
   needed unless you want to explicitly set `container_name:
   rag-support-agent-db`.
4. **`Dockerfile`** — no `name` field needed; the image is named at
   build time via `docker build -t rag-support-agent .`.
5. **`vercel.json`** — no change needed; Vercel uses the repo name for
   the project name, and the repo rename happens on GitHub (the
   developer does this, not the agent).

**What NOT to change:**
- The `packages/` workspace package names (`@app/domain`,
  `@app/application`, etc.) — these are internal, not published, and
  renaming them would touch every import in the codebase for no
  benefit.
- The `src/` directory structure.
- Any import paths.

**Repo rename (developer action, not agent action):**
The agent should add a note in the handoff file reminding the
developer to rename the GitHub repo from `rag_agent` to
`rag-support-agent` (Settings → Repository name → Rename). GitHub
auto-redirects old URLs, so no links break.

---

## Env Vars

No new env vars. This session sets defaults for existing vars in
`.env.example`.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

New files:
- `docker-compose.yml`
- `Dockerfile`
- `.dockerignore`
- `scripts/migrate.ts`

Modified:
- `next.config.ts` — `output: 'standalone'`
- `package.json` — new/updated scripts (`build`, `db:migrate`, `dev:db`,
  `dev:ollama`), project name → `rag-support-agent`
- `.env.example` — rewritten with sane defaults
- `README.md` — rewritten: 3-step Quick Start, "Getting your API keys"
  section with per-service walkthroughs, existing details moved under
  "Reference"

---

## Gotchas / Things to Watch Out For

1. **`output: 'standalone'` and Vercel**: Vercel ignores this setting
   and uses its own build. It only affects the Docker image. Don't
   worry about it breaking Vercel deploys.

2. **`pnpm build` now runs migrations**: This means every Vercel build
   runs migrations. If the migration fails, the build fails. This is
   the desired behavior — you don't want to deploy code that expects a
   schema the DB doesn't have. Make sure `DATABASE_URL` is set in
   Vercel's build environment (it should be — it's already required).

3. **Docker Compose `profiles`**: The `ollama` service uses
   `profiles: ["ollama"]` so it doesn't start by default. This avoids
   downloading the Ollama image (large) when the user just wants
   Postgres. Start it with `docker compose --profile ollama up -d`.

4. **Ollama model pull**: The first time you use Ollama, you need to
   pull the models (`ollama pull nomic-embed-text`, `ollama pull
   llama3.1`). This is documented in the README. The models are ~4 GB
   total. Consider adding a one-line script or a Makefile target for
   this.

5. **`docker-compose.yml` vs `docker-compose.yaml`**: Docker Compose
   supports both extensions. Use `.yml` for consistency with most
   projects.

6. **Dockerfile `COPY packages/*/package.json`**: The glob pattern
   works in Docker if the directories exist at build time. Make sure
   the `COPY` command copies all workspace package.json files. If pnpm
   workspaces have nested deps, the COPY pattern may need adjustment.

7. **README length**: The existing README is ~339 lines with extensive
   documentation. Don't delete the detailed sections — move them under
   a "Reference" heading. The Quick Start at the top should be under 30
   lines.

8. **`pnpm configure` still works**: Don't remove or break the CLI
   setup wizard. It's still useful for interactive first-time setup.
   Just don't make it the primary path in the README.

9. **`.env.example` is committed**: Check that `.env.example` is NOT
   in `.gitignore` (it should be committed). `.env.local` should be in
   `.gitignore` (it is).

10. **Project rename + repo rename**: The `package.json` `name` field
    changes from `rag_agent` to `rag-support-agent`. The GitHub repo
    rename is a **developer action** (Settings → Repository name →
    Rename). GitHub auto-redirects old URLs, so no links break. The
    agent should NOT attempt to rename the GitHub repo — only change
    `package.json`. Note this in the handoff file.

11. **"Getting your API keys" section length**: This section is long
    (one subsection per service) but it's the single most useful
    section for a new developer. Keep it. It goes in the README between
    "Deploy to Vercel" and "Stack".

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run — all tests must pass
pnpm arch         # dependency-cruiser
```

**End-to-end validation** (if Docker is available):

```bash
# 1. Fresh clone simulation
git stash  # stash any uncommitted changes
docker compose up -d db
cp .env.example .env.local
# Add Clerk keys to .env.local (required for auth)
pnpm install
pnpm dev
# Verify: app boots on http://localhost:3000
# Verify: landing page loads
# Verify: sign-in redirect works (needs Clerk keys)
# Verify: /admin/upload works (filesystem blob storage)
# Verify: /chat works (Ollama embeddings + chat, if Ollama is running)

# 2. With Ollama
docker compose --profile ollama up -d
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3.1
pnpm dev
# Upload a PDF, ask a question in /chat → should get a grounded answer

# 3. Migrate-on-build
pnpm build
# Verify: migrations run before next build
# Verify: build succeeds
```

**Vercel deploy validation** (if you have a Vercel project):
```bash
# Push to a branch, let Vercel auto-deploy
# Verify: build runs migrations (check build logs)
# Verify: app boots on the preview URL
# Verify: /api/chat works with production env vars
```

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-08): docker-compose, Dockerfile, README quick start, migrate-on-build

Add docker-compose.yml (pgvector + Ollama), Dockerfile with
standalone output, .env.example defaults, 3-step README quick start.
Migrations now run during pnpm build. This is the final session.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-08.md`.
Do NOT push. The developer pushes when ready.

This is the **final session** — after committing, inform the developer
that all 8 sessions are complete (see Handoff Instructions below).

---

## Handoff Instructions

This is the **final session**. When complete:

1. Write `docs/execution-plan/context/after-session-08.md` as usual
   (following the handoff protocol format).

2. **Inform the developer that the entire plan is complete.** Your
   final message to the developer should include:

   ```
   All 8 sessions of the execution plan are complete.

   Summary of what was done across all sessions:
   - Session 1: DB driver swapped to @neondatabase/serverless
   - Session 2: LLM providers made env-swappable (Google/OpenAI/Ollama)
   - Session 3: PDF blobs moved to object storage (R2/S3/filesystem)
   - Session 4: QStash async ingest queue for large PDFs
   - Session 5: Rate limiter + query stats moved to Upstash Redis
   - Session 6: Auth decoupled behind SessionStore port
   - Session 7: Centralized env validation + instrumentation.ts
   - Session 8: Docker Compose, Dockerfile, README Quick Start + API
     keys guide, project rename, migrate-on-build

   The app is now:
   - Fully serverless (no servers to manage)
   - Vercel-first, portable to Cloudflare Workers/Deno Deploy/Netlify
   - Provider-swappable via env vars (DB, LLM, blobs, auth, rate limit)
   - Zero-key local dev via Docker + Ollama
   - Deployable with `git clone && docker compose up -d db && pnpm install && pnpm dev`
   - README includes a "Getting your API keys" section with sign-up
     links, free-tier notes, and dashboard walkthroughs for every
     service (Clerk, Neon, Google AI Studio, OpenAI, R2, Upstash
     Redis, Upstash QStash)

   Next steps for you (the developer):
   1. Review all changes and commit
   2. Rename the GitHub repo: Settings → Repository name →
      `rag-support-agent` (GitHub auto-redirects old URLs)
   3. Run the backfill script (scripts/backfill-blobs.ts) if you have
      existing PDFs in the database
   4. Set up Cloudflare R2 (or S3) for production blob storage
   5. Set up Upstash Redis for production rate limiting
   6. Set up QStash for async ingest (optional, for large PDFs)
   7. Deploy to Vercel with the production env vars
   ```

3. Include in the handoff file:
   - The final state of `.env.example` (all defaults)
   - The Quick Start steps from the README
   - The "Getting your API keys" section from the README
   - The `docker-compose.yml` contents
   - Any issues encountered during end-to-end validation
   - The backfill script reminder for the developer
   - The GitHub repo rename reminder for the developer

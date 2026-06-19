# Product Requirement Document (PRD): Gardenia Public School Student Support RAG Agent

## 1. Document Overview & Objectives

### 1.1 Objective

Build a production-scalable, serverless AI student-support agent for **Gardenia Public School**, a K-12 institution. The system is designed to:

1.  Answer student and parent questions about school policies, schedules, fees, exams, transport, the parent portal, and co-curricular activities by retrieving relevant information from uploaded school documentation (RAG).
2.  Provide source citations for every answer generated from the documentation, so users can verify the source material.
3.  Automatically create and track support tickets in a database when the documentation cannot resolve an issue or when the user explicitly asks for human help.
4.  Allow administrators to upload, list, preview, replace, soft-delete, and restore reference PDFs (handbooks, circulars, fee schedules, exam policies) without redeploying the application.
5.  Run on the Google AI Studio free tier for embeddings and Neon Serverless Postgres for storage, with the conversational LLM swappable to any OpenAI-compatible endpoint (free or paid).
6.  Authenticate every user with **Clerk** (via Vercel Marketplace), assign one of two roles (`admin` or `user`), gate the chat and admin console behind sign-in, and bootstrap the first set of admins from an `ADMIN_EMAILS` env var.

### 1.2 Out of scope

- **No Microsoft SSO setup.** Sign-in providers (email+password, Google) are enabled in the Clerk dashboard; the code itself is provider-agnostic.
- **No webhooks from Clerk** (`user.created`, `user.updated`). The per-request sync is enough for v1; a webhook handler can be added later to remove the per-request Clerk call.
- **No real persistent rate limit (Upstash).** The in-memory limiter is documented as single-instance.
- **No real analytics backend.** The `queryCounts` counter is in-process and resets on cold start.
- **No multi-tenancy.** A single corpus serves a single school. A second school would need a second deployment or a tenant-id shim.
- **No paid LLM by default.** The default conversational LLM is whatever OpenAI-compatible endpoint the operator configures (a free tier proxy works fine). The default embeddings model is Google's `gemini-embedding-001` (768-dim, free).

## 2. Technical Stack

  - **Framework:** Next.js 16 (App Router) on Node, using Turbopack in dev. Provides the React frontend, the streaming API route, and the server actions in a single codebase.
  - **Database & Vector Store:** Neon Serverless Postgres with the `pgvector` extension and an HNSW cosine index. Stores documents, chunks (with embeddings), support tickets, users (Clerk mirror), and audit logs.
  - **ORM:** Drizzle ORM for type-safe schema definitions and queries.
  - **Auth:** Clerk (`@clerk/nextjs` v7) installed via the Vercel Marketplace. `clerkMiddleware` lives in `src/proxy.ts` (Next 16's renamed `middleware.ts`); `createRouteMatcher` gates `/chat`, `/admin`, and the corresponding API routes.
  - **AI SDK:** Vercel AI SDK v6 (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/react`) for streaming text, tool execution, and chat state.
  - **Embeddings model:** Google `gemini-embedding-001` configured for 768 dimensions and a retrieval-doc task type (free via Google AI Studio).
  - **Chat model:** Any OpenAI-compatible endpoint, configured via `CUSTOM_LLM_API_KEY`, `CUSTOM_LLM_BASE_URL`, `LLM_MODEL`.
  - **PDF processing:** `pdf-parse@2` for text extraction. Externalised via `serverExternalPackages` in `next.config.ts` so Turbopack doesn't try to bundle its sibling worker file.
  - **Text chunking:** `@langchain/textsplitters` `RecursiveCharacterTextSplitter` (150-char chunks with 20-char overlap).

## 3. Feature Requirements & User Interactions

### Feature 1: Conversational Q&A (authenticated)

  - **Purpose:** Allow signed-in students and parents to ask questions in plain English and receive conversational answers drawn from school documentation.
  - **Interaction:**
    1. The user signs in via Clerk (email+password or Google). `proxy.ts` redirects unauthenticated `/chat` traffic to `/sign-in?redirect_url=...`.
    2. The user types a question (e.g. "What is the tuition fee for grade 6?").
    3. The system embeds the question, retrieves the top-3 matching chunks (cosine similarity > 0.5), and uses them as context for the LLM.
    4. The LLM responds with a natural-language answer synthesised from the documentation. If the context does not contain the answer, it offers to open a support ticket.
  - **Rate limit:** 30 requests per minute per Clerk user. The 31st request returns HTTP 429 with a `Retry-After` header. The limiter is in-memory (LRU, 5 000 keys) — fine for a single Vercel function instance; swap for Upstash when we move to multi-region.

### Feature 2: RAG Search & Streamed Citations

  - **Purpose:** Make every answer traceable to its source.
  - **Interaction:**
    1. The system converts the query into a 768-dim vector using Google's `gemini-embedding-001` model.
    2. The vector store matches the query against stored chunks with cosine similarity.
    3. The matched chunks (their similarity score and a 150-character snippet) are streamed to the client as `data-citation` parts on the assistant message, immediately and before the text deltas. The client renders each as a citation card above the assistant reply.

### Feature 3: Automated Support Ticket Tool

  - **Purpose:** Escalate to a human when documentation cannot answer the question or the user asks for a ticket.
  - **Interaction:**
    1. The LLM is given a `createSupportTicket` tool with `name`, `email`, and `issue` arguments.
    2. When the LLM calls the tool, the route generates the next sequential ticket id (`TKT-NNNN` starting at `TKT-1001`) and inserts a row into the `tickets` table. `userId` is the **real Clerk user id** of the signed-in user (no more `anonymous`).
    3. The tool returns `{ ticketId, status: "created" }`; the LLM surfaces the ticket id in its reply.

### Feature 4: PDF Document Ingestion (admin)

  - **Purpose:** Let administrators load reference material into the corpus without redeploying.
  - **Interaction:**
    1. **Admin upload (browser):** Sign in as an admin, navigate to `/admin/upload`, select a PDF, click *Upload*. The `uploadPdfAction` server action is wrapped in `requireAdmin()` and parses, chunks, embeds, and persists the file. The raw PDF bytes are also stored in the new `documents.blob bytea` column so the admin console can render an inline preview.
    2. **CLI seed (dev):** `pnpm seed` walks `scripts/fixtures/*.pdf` and runs each through the same `ingestFile` function.
  - The pipeline is identical in both cases: SHA-256 hash the file, de-dupe by `(fileName, fileHash)`, parse with `pdf-parse`, chunk with `RecursiveCharacterTextSplitter`, embed with `gemini-embedding-001`, and bulk-insert.
  - Every upload / replace / delete / restore is recorded in the `document_audit` table with the actor's Clerk user id.

### Feature 5: Document Versioning & De-duplication

  - **Purpose:** Prevent identical or outdated chunks from polluting the vector space when the same file is uploaded twice.
  - **Interaction:**
    1. On every upload, the system computes a SHA-256 hash of the file.
    2. If a document with the same `fileName` already exists and the hash matches, the upload is a no-op (returns `status: "unchanged"`).
    3. If the hash differs, the existing document and its chunks (via `ON DELETE CASCADE`) are removed and the new version is inserted (returns `status: "updated"`).
    4. If no existing document matches, the new one is inserted (returns `status: "inserted"`).

### Feature 6: Admin Console (`/admin`)

  - **Purpose:** Give admins a single place to manage the knowledge base, users, and tickets.
  - **Pages:**
    - **`/admin` (Overview)** — Cards for total docs, chunks, tickets, open tickets, users; the latest 10 audit events.
    - **`/admin/upload`** — File picker. After a successful upload, shows the chunk count and a link to the new row in Documents.
    - **`/admin/documents`** — Searchable, paginated table of every document. Each row has *Preview* (full-page iframe over `/api/admin/documents/[id]/blob`), *Download*, *Replace*, *Delete* (soft delete; restore within 7 days), and *Hard delete* (cascade).
    - **`/admin/documents/[id]/preview`** — Single-document preview page. Admin-only.
    - **`/admin/tickets`** — Searchable, paginated table of tickets with filters by status and assignee. Each row opens a drawer with the full issue, a notes thread, a status select, an assignee select, and an "Add note" textarea.
    - **`/admin/users`** — Searchable, paginated list of all Clerk users (mirrored locally). Per-row *Promote / Demote* and *Impersonate* (issues a short-lived Clerk sign-in token and opens it in a new tab).
    - **`/admin/analytics`** — Read-only stats. Document / chunk / ticket / user counts plus a "top queries" table from the in-process `queryCounts` counter.
    - **`/admin/audit`** — Full audit log filterable by document id or ticket id.

### Feature 7: Role-Based Access Control

  - **Purpose:** Keep the admin surface out of reach of regular users and out of reach of the public.
  - **Mechanism:**
    1. Every Clerk user has a `publicMetadata.role` of either `admin` or `user`. Clerk is the source of truth; the local `users` table is a cache.
    2. `src/proxy.ts` calls `clerkMiddleware` with a `createRouteMatcher`-based rule set. `/chat(.*)`, `/admin(.*)`, and the matching API routes are protected; non-admins hitting `/admin` are redirected to `/chat`.
    3. Every server action and admin API route calls `requireAdmin()` as its second line. The helper throws `ForbiddenError`, which the action / route catches and returns as a 403 (or `{ error: 'Forbidden' }` for server actions).
    4. **Bootstrap:** When a user signs in for the first time and their email is in the `ADMIN_EMAILS` env var, they are auto-promoted to `admin` (both in Clerk's `publicMetadata` and in the local `users` row). The first time they hit any server-rendered page after sign-in, `getAppSession()` performs the bootstrap.

## 4. Data Flows

### Data Flow A: Document Ingestion

```
[Admin Upload / CLI Seed]
    └─> requireAdmin()                       // server action only
    └─> Calculate SHA-256 hash
          └─> Look up document by fileName
                ├─ same hash  -> status=unchanged
                ├─ diff hash  -> delete old + chunks (CASCADE)
                └─ new        -> insert
          └─> pdf-parse.extractText
                └─> RecursiveCharacterTextSplitter (150 / 20)
                      └─> embed each chunk (gemini-embedding-001, 768-dim)
                            └─> bulk insert into `chunks` table
          └─> update documents.blob = raw bytes (admin preview)
          └─> insert document_audit row { action: 'upload' | 'replace', actorId }
```

### Data Flow B: Conversational RAG

```
[Client: useChat]
    └─> POST /api/chat  { messages }
          └─> auth() → userId
                └─> rateLimit(`chat:${userId}`)   // 30 / 60s
                      └─> 429 on overflow
          └─> recordQuery(userId, lastUserText)  // analytics counter
          └─> searchChunks(lastUserText)         // embed + cosine top-3
                └─> inject 3x data-citation into the LLM's UI message stream
          └─> streamText(model, system, messages, tools: { createSupportTicket })
                └─> createSupportTicket.execute({ name, email, issue })
                      └─> INSERT { ticketId, userId: clerkUserId, ... }
                └─> merge result.toUIMessageStream() into the response
          └─> createUIMessageStreamResponse → SSE
```

### Data Flow C: Support Ticket Tool

```
[LLM decides to call createSupportTicket]
    └─> tool.execute({ name, email, issue })
          └─> SELECT MAX ticket number from `tickets`
                └─> INSERT { ticketId: 'TKT-NNNN', userId: clerk_user_id, ... }
                      └─> return { ticketId, status: 'created' }
                            └─> LLM surfaces ticket id in its reply
```

### Data Flow D: Admin User Promotion

```
[Admin clicks "Promote" on /admin/users]
    └─> setRoleAction(clerkUserId, 'admin')
          └─> requireAdmin()
          └─> db.update(users).set({ role: 'admin' }).where(...)
                └─> clerkClient.users.updateUserMetadata(clerkUserId, { publicMetadata: { role: 'admin' } })
                └─> logTicketEvent({ action: 'impersonation', ticketId: `user:${clerkUserId}`, actorId })
          └─> revalidatePath('/admin/users')
```

### Data Flow E: Admin Sign-In Bootstrap

```
[First authenticated request after sign-in]
    └─> clerkMiddleware → auth() → userId
    └─> getAppSession()   // any server component or API route
          └─> auth() → userId; currentUser() → email, publicMetadata
          └─> getUserByClerkId(userId)
                └─> if missing: syncUserFromClerk()
                      └─> role = publicMetadata.role ?? (isAdminEmail(email) ? 'admin' : 'user')
                      └─> db.insert(users).values({ ... }).onConflictDoUpdate()
                └─> if exists && isAdminEmail(email) && role !== 'admin': re-bootstrap
```

## 5. Operational Concerns

  - **Identity:** Every row in `documents`, `tickets`, `document_audit`, and `ticket_audit` records a real Clerk user id. The local `users` table mirrors Clerk and is the source for role-based UI checks.
  - **Admin bootstrap:** `ADMIN_EMAILS` is a comma-separated env var. The first time a user with one of those emails signs in, they are auto-promoted. After that, admins promote others from `/admin/users`.
  - **Concurrency / pooling:** A single `pg.Pool` (max 10) is shared across the Next.js process and attached to the Vercel function lifecycle via `attachDatabasePool`. No connection-leak issues during cold/warm cycles.
  - **Vector extension:** The `pgvector` extension must be enabled on the Neon database. The `embedding` column is `vector(768)`; the HNSW index is named `embedding_idx` and uses `vector_cosine_ops`.
  - **Externalising pdf-parse:** The package ships a self-contained CJS bundle with a relative `./pdf.worker.mjs` import that Turbopack cannot resolve. `next.config.ts` lists it under `serverExternalPackages` so Node loads it directly.
  - **Citation de-duplication:** `data-citation` parts are injected right after the assistant message's `start` chunk in the LLM's UI message stream, so they appear once per assistant message and never as a phantom separate message.
  - **Rate limit:** In-memory LRU keyed by `chat:${userId}`. 30 requests / 60 s, max 5 000 keys, evicting the least-recently-touched. Single-instance only; replace with Upstash before going multi-region.
  - **Audit log:** `document_audit` and `ticket_audit` are append-only. They preserve the actor's Clerk user id and never throw on the write path.
  - **Migrations:** Drizzle's generated migration is in `drizzle/0000_*.sql`. For an existing DB, `scripts/apply-migration.mjs` runs the file plus the `ADD COLUMN IF NOT EXISTS` statements for the new columns on the pre-existing tables.
  - **Testing:** 91 unit/integration tests across 17 files (chat route, ingest, search, schema, users, ratelimit, query-stats, audit, admin actions, admin API routes, proxy middleware) run with `pnpm test`. A new Playwright spec at `e2e/admin.spec.ts` covers the public-route behaviour; full auth-gated E2E requires a configured Clerk project and is gated on `SKIP_AUTH_E2E=0`.

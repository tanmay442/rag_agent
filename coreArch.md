# System Architecture & Codebase Blueprint (`coreArch.md`)

This document describes the **current** state of the Gardenia Public School student-support RAG agent. The codebase is auth-gated end-to-end on Clerk: every request to `/chat` or `/admin` must carry a valid Clerk session, and `/admin` further requires `role === 'admin'` (mirrored into a local `users` cache from Clerk's `publicMetadata.role`). The first set of admins is bootstrapped from the `ADMIN_EMAILS` env var; after that, admins promote others from `/admin/users`.

## 1. Directory Structure

```text
rag_agent/
├── drizzle/                          # Drizzle migrations folder
├── scripts/
│   ├── apply-migration.mjs           # One-shot migrator (CREATE + ADD COLUMN)
│   ├── fixtures/                     # Seed PDFs (Gardenia handbooks + guides)
│   │   ├── sample.pdf                # Student & Parent Handbook
│   │   ├── admissions.pdf            # Admissions guide
│   │   ├── exams-and-grading.pdf     # Exam & grading policy
│   │   ├── co-curricular.pdf         # Houses, sports, clubs, events
│   │   └── parent-portal-guide.pdf   # Parent portal user guide
│   ├── make-sample-pdf.ts            # Regenerate the handbook PDF
│   ├── make-portal-fixtures.ts       # Regenerate the four topic PDFs
│   ├── seed-docs.ts                  # CLI seeder (ingests every PDF in fixtures/)
│   ├── setup-test-db.ts              # Provisions a per-run Neon branch
│   └── teardown-test-db.ts           # Deletes the per-run branch
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout (ClerkProvider + Navigation)
│   │   ├── page.tsx                  # Landing (public)
│   │   ├── chat/page.tsx             # Chat UI (auth required)
│   │   ├── sign-in/[[...sign-in]]/   # Clerk <SignIn /> card
│   │   ├── sign-up/[[...sign-up]]/   # Clerk <SignUp /> card
│   │   ├── admin/
│   │   │   ├── layout.tsx            # Side nav + requireAdmin()
│   │   │   ├── page.tsx              # Overview cards + latest audit
│   │   │   ├── actions.ts            # All admin server actions
│   │   │   ├── upload/page.tsx       # PDF upload form
│   │   │   ├── documents/page.tsx    # Searchable list
│   │   │   ├── documents/[id]/preview/page.tsx
│   │   │   ├── tickets/page.tsx      # Ticket list with drawer
│   │   │   ├── tickets/ticket-drawer.tsx (client island)
│   │   │   ├── users/page.tsx        # User list
│   │   │   ├── users/user-row-actions.tsx (client island)
│   │   │   ├── analytics/page.tsx    # Read-only stats
│   │   │   └── audit/page.tsx        # Full audit log
│   │   └── api/
│   │       ├── chat/route.ts         # RAG streaming + ticket tool (auth)
│   │       └── admin/
│   │           ├── users/route.ts
│   │           ├── users/[clerkId]/role/route.ts
│   │           ├── users/[clerkId]/impersonate/route.ts
│   │           ├── documents/[id]/route.ts
│   │           ├── documents/[id]/blob/route.ts
│   │           ├── documents/[id]/download/route.ts
│   │           ├── documents/[id]/restore/route.ts
│   │           ├── tickets/route.ts
│   │           ├── tickets/[ticketId]/route.ts
│   │           ├── analytics/summary/route.ts
│   │           └── audit/route.ts
│   ├── components/
│   │   ├── ChatInterface.tsx         # Streaming chat with citation cards
│   │   └── Navigation.tsx            # Top nav (auth-aware, server component)
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── session.ts            # getAppSession, requireAdmin, ForbiddenError
│   │   │   ├── users.ts              # syncUserFromClerk, setUserRole, listUsers
│   │   │   ├── ratelimit.ts          # in-process LRU, 30 / 60s
│   │   │   ├── query-stats.ts        # in-process per-user top-queries counter
│   │   │   └── audit.ts              # logDocumentEvent, logTicketEvent
│   │   ├── admin/
│   │   │   ├── documents.ts          # listDocuments, upload, replace, soft/restore/hard delete
│   │   │   ├── tickets.ts            # listTickets, getTicket, updateTicket
│   │   │   ├── audit.ts              # listAudit (document + ticket)
│   │   │   └── analytics.ts          # getAnalyticsSummary
│   │   ├── chat/types.ts             # MyUIMessage alias
│   │   ├── db/
│   │   │   ├── client.ts             # pg.Pool + Drizzle init
│   │   │   ├── schema.ts             # documents, chunks, tickets, users, document_audit, ticket_audit
│   │   │   └── schema-vector.ts      # pgvector customType
│   │   ├── llm/client.ts             # getEmbeddingModel / getChatModel
│   │   └── rag/
│   │       ├── ingest.ts             # extractText, chunkText, embedChunks, ingestFile
│   │       └── search.ts             # searchChunks (cosine similarity)
│   ├── proxy.ts                      # clerkMiddleware (Next 16 convention)
│   └── ...
├── e2e/
│   ├── chat.spec.ts                  # Existing chat smoke
│   └── admin.spec.ts                 # New admin/public-route smoke
├── next.config.ts                    # serverExternalPackages: ['pdf-parse']
├── package.json
└── tsconfig.json
```

## 2. Public Database Schema (`src/lib/db/schema.ts`)

Six tables. The schema grew to add the Clerk-mirror `users` table, the `blob` + `deleted_at` columns on `documents` (raw PDF + soft delete), the `assigned_to` + `notes` columns on `tickets`, and two append-only audit tables.

```typescript
import {
  pgTable, serial, text, timestamp, integer, customType, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from './schema-vector';

// 1. Documents metadata + raw bytes + soft delete.
export const documents = pgTable('documents', {
  id:         serial('id').primaryKey(),
  fileName:   text('file_name').notNull().unique(),
  fileHash:   text('file_hash').notNull(),
  uploadedBy: text('uploaded_by').notNull(),   // real Clerk user id
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  blob:       customType<{ data: Buffer | null; driverData: Buffer | null }>({ dataType: () => 'bytea' })('blob'),
  deletedAt:  timestamp('deleted_at'),
});

// 2. Document chunks — vector store. HNSW index for cosine similarity.
export const chunks = pgTable('chunks', {
  id:         serial('id').primaryKey(),
  documentId: serial('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  content:    text('content').notNull(),
  embedding:  vector('embedding').notNull(),
}, (table) => [
  index('embedding_idx').using('hnsw', sql`${table.embedding} vector_cosine_ops`),
]);

// 3. Support tickets + admin metadata.
export const tickets = pgTable('tickets', {
  id:         serial('id').primaryKey(),
  ticketId:   text('ticket_id').notNull().unique(),
  userId:     text('user_id').notNull(),       // real Clerk user id
  name:       text('name').notNull(),
  email:      text('email').notNull(),
  issue:      text('issue').notNull(),
  status:     text('status').notNull().default('created'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
  assignedTo: text('assigned_to'),             // Clerk user id
  notes:      text('notes'),                   // markdown
});

// 4. Clerk-mirrored users + role cache.
export const users = pgTable('users', {
  clerkUserId: text('clerk_user_id').primaryKey(),
  email:       text('email').notNull().unique(),
  name:        text('name'),
  imageUrl:    text('image_url'),
  role:        text('role').notNull().default('user'),
  lastSeenAt:  timestamp('last_seen_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  check('users_role_check', sql`${table.role} IN ('admin','user')`),
]);

// 5. Document audit log.
export const documentAudit = pgTable('document_audit', {
  id:         serial('id').primaryKey(),
  documentId: integer('document_id').references(() => documents.id, { onDelete: 'set null' }),
  actorId:    text('actor_id').notNull(),
  action:     text('action').notNull(),
  at:         timestamp('at').defaultNow().notNull(),
}, (table) => [
  check('document_audit_action_check', sql`${table.action} IN ('upload','replace','delete','restore')`),
]);

// 6. Ticket audit log (+ impersonation events).
export const ticketAudit = pgTable('ticket_audit', {
  id:       serial('id').primaryKey(),
  ticketId: text('ticket_id').references(() => tickets.ticketId, { onDelete: 'set null' }),
  actorId:  text('actor_id').notNull(),
  action:   text('action').notNull(),
  at:       timestamp('at').defaultNow().notNull(),
}, (table) => [
  check('ticket_audit_action_check', sql`${table.action} IN ('create','assign','status_change','note','impersonation')`),
]);
```

## 3. Auth & RBAC Pipeline

```
[Browser] → /chat or /admin or /api/chat|/api/admin
    └─> proxy.ts (clerkMiddleware)
          └─> isPublicRoute(req)?  → NextResponse.next()
          └─> isProtectedRoute(req)?
                └─> const { sessionClaims } = await auth.protect()
                      └─> isAdminRoute(req)?
                            └─> role !== 'admin'?  → 307 to /chat
                            └─> else                 → NextResponse.next()
    └─> Server Component / Action / Route
          └─> requireAdmin()           // throws ForbiddenError on non-admin
                └─> getAppSession()    // Clerk + local users row + bootstrap
```

Server actions wrap the role check in a `requireAdminOrError()` helper that returns `{ error: 'Forbidden' }` instead of throwing — this keeps server-action semantics intact. API routes wrap the role check in a `try { ... } catch (ForbiddenError) { return new NextResponse('Forbidden', { status: 403 }); }` block so the middleware doesn't have to be the only line of defense.

## 4. New Modules

  - **`src/lib/auth/users.ts`** — `syncUserFromClerk`, `getUserByClerkId`, `listUsers`, `setUserRole`, `isAdminEmail`, `getAdminEmails`. `setUserRole` writes to both the local `users` table and Clerk's `publicMetadata`.
  - **`src/lib/auth/audit.ts`** — `logDocumentEvent`, `logTicketEvent`. Fire-and-forget on the action paths; never throws.
  - **`src/lib/auth/ratelimit.ts`** — In-memory LRU keyed by string. Default: 30 requests / 60 s, 5 000-key capacity, evicts least-recently-touched.
  - **`src/lib/auth/query-stats.ts`** — In-memory top-queries counter, per user. Read by `/api/admin/analytics/summary`.
  - **`src/lib/admin/{documents,tickets,audit,analytics}.ts`** — All admin reads and writes, with a single `requireAdmin()` boundary at the action / route layer.

## 5. Out of scope (and why)

  - Microsoft SSO is enabled in the Clerk dashboard; the code is provider-agnostic.
  - Clerk webhooks (`user.created`, `user.updated`) are deferred. The per-request sync is good enough for v1.
  - Upstash rate limit. The in-memory limiter is documented as single-instance; swap it out when we go multi-region.
  - A real analytics backend. The in-process counter is good enough for a soft signal.
  - A cron for stale-document alerts (the optional fourth extra from the plan was not picked).
  - Migrating old `tickets.userId = 'anonymous'` rows to a real user id. Existing rows keep their placeholder; the admin Tickets page shows a `(anonymous)` badge for them.

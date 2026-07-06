# Session 04: QStash Queue for Async PDF Ingest

## Objective

Add a QStash-backed queue for asynchronous PDF ingest. Small PDFs
(<4 MB) use the existing synchronous path. Large PDFs are uploaded to
the blob store (from Session 3), a `documents` row is inserted with
`ingest_status = 'queued'`, and a QStash message enqueues the ingest
worker. The worker reads the PDF from the blob store, parses it,
embeds it, and inserts chunks. This unblocks large PDFs and
non-blocking uploads on Vercel serverless.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

No external services needed — without `QSTASH_TOKEN`, the queue is
a no-op and all uploads go through the sync path.

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-03.md` first. The blob
storage refactor from Session 3 should be complete. Key things to know:

- PDFs are stored in object storage (R2/S3/filesystem) via a
  `BlobStorage` port.
- `documents.storage_key` replaces the old `documents.blob` column.
- The `Composition` type includes `blobStorage`.
- The backfill script exists but the `DROP COLUMN blob` migration is
  deferred.

### Files to Read First

- `packages/application/src/admin/documents.ts` — `uploadPdf` (line 96),
  `replacePdf` (line 191)
- `packages/application/src/rag/ingest.ts` — `ingestFile` function
- `src/app/(app)/admin/actions.ts` — `uploadPdfAction` (line 44)
- `packages/infrastructure/src/db/schema.ts` — `documents` table
- `src/composition.ts` — `uploadPdf` wiring
- `packages/domain/src/ports.ts` — port interfaces

---

## Implementation

### 1. Add `@upstash/qstash` to dependencies

```bash
pnpm add @upstash/qstash
```

### 2. Create `packages/domain/src/ports.ts` — `IngestQueue` port

Add to the ports file:

```typescript
export interface IngestQueue {
  enqueue(payload: { documentId: number }): Promise<void>;
}
```

### 3. Create `packages/infrastructure/src/queue/qstash-queue.ts`

```typescript
import { Client } from '@upstash/qstash';
import type { IngestQueue } from '@app/domain';

export function createQstashQueue(): IngestQueue {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is not set.');
  const client = new Client({ token });
  const baseUrl = process.env.QSTASH_INGEST_WORKER_URL ?? '';
  return {
    async enqueue({ documentId }) {
      if (!baseUrl) throw new Error('QSTASH_INGEST_WORKER_URL is not set.');
      await client.publishJSON({
        url: `${baseUrl}/api/admin/ingest-worker`,
        body: { documentId },
        retries: 3,
      });
    },
  };
}
```

`QSTASH_INGEST_WORKER_URL` must be the public URL of the deployment
(QStash calls back over HTTP). For local dev, QStash cannot reach
`localhost` — use the sync path instead (no `QSTASH_TOKEN`).

### 4. Create `packages/infrastructure/src/queue/sync-queue.ts`

A no-op queue for local dev (no `QSTASH_TOKEN`):

```typescript
import type { IngestQueue } from '@app/domain';

export function createSyncQueue(): IngestQueue {
  return {
    async enqueue() {
      // No-op: sync mode, ingest happens in the request
    },
  };
}
```

### 5. Create `packages/infrastructure/src/queue/index.ts`

Factory:

```typescript
import type { IngestQueue } from '@app/domain';
import { createQstashQueue } from './qstash-queue';
import { createSyncQueue } from './sync-queue';

export function createIngestQueue(): IngestQueue {
  if (process.env.QSTASH_TOKEN) return createQstashQueue();
  return createSyncQueue();
}
```

### 6. Add `ingest_status` column to `documents` schema

In `packages/infrastructure/src/db/schema.ts`, add to the `documents`
table:

```typescript
ingestStatus: text('ingest_status').notNull().default('done'),
// values: 'queued' | 'ingesting' | 'done' | 'failed'
```

### 7. Generate migration

```bash
pnpm db:generate
```

This produces a migration like:
```sql
ALTER TABLE "documents" ADD COLUMN "ingest_status" text NOT NULL DEFAULT 'done';
```

Existing rows get `'done'` — they're already ingested.

### 8. Update `packages/domain/src/ports.ts` — `DocumentRepository`

Add:
```typescript
updateIngestStatus(id: number, status: 'queued' | 'ingesting' | 'done' | 'failed'): Promise<void>;
```

### 9. Update `packages/infrastructure/src/db/repositories.ts`

Add the `updateIngestStatus` function and wire it into
`createDocumentRepo`.

### 10. Update `packages/application/src/admin/documents.ts`

Split `uploadPdf` into two paths:

**`uploadPdfSync`** (current behavior, for <4 MB or when
`QSTASH_TOKEN` is unset):
- Same as current `uploadPdf`: parse, embed, insert chunks, put blob,
  set storage key, all in a transaction.
- Sets `ingest_status = 'done'`.

**`uploadPdfQueued`** (for >=4 MB when `QSTASH_TOKEN` is set):
- Puts the PDF buffer into the blob store.
- Inserts the `documents` row with `storage_key` and
  `ingest_status = 'queued'`.
- Enqueues `{ documentId }` via the `IngestQueue`.
- Returns immediately with `status: 'queued'`.
- No parsing/embeding happens in this path.

The `uploadPdf` function dispatches based on file size and
`QSTASH_TOKEN` presence. The caller (server action) doesn't need to
know which path was taken — it just gets an `IngestResult` with
`status: 'inserted' | 'updated' | 'unchanged' | 'queued'`.

Update `IngestResult`:
```typescript
export interface IngestResult {
  documentId: number;
  chunks: number;
  status: 'inserted' | 'updated' | 'unchanged' | 'queued';
}
```

### 11. Create `src/app/api/admin/ingest-worker/route.ts`

POST handler that QStash calls:

```typescript
import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { getComposition } from '@/composition';

export async function POST(req: Request) {
  // 1. Verify QStash signature
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  const body = await req.text();
  const signature = req.headers.get('upstash-signature') ?? '';
  const isValid = await receiver.verify({
    body,
    signature,
  });
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  // 2. Parse payload
  const { documentId } = JSON.parse(body);
  if (!Number.isInteger(documentId)) {
    return NextResponse.json({ error: 'Invalid documentId' }, { status: 400 });
  }

  // 3. Run ingest
  const comp = getComposition();
  try {
    await comp.ingestQueuedDocument(documentId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    // Non-2xx → QStash retries
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 });
  }
}
```

### 12. Add `ingestQueuedDocument` to composition

In `src/composition.ts`, add a method that:
1. Loads the document by id.
2. Sets `ingest_status = 'ingesting'`.
3. Reads the PDF from `blobStorage.get(storageKey)`.
4. Calls `ingestFile` (parse, embed, insert chunks) in a transaction.
5. Sets `ingest_status = 'done'` on success, `'failed'` on error.

### 13. Update `src/app/(app)/admin/actions.ts` — `uploadPdfAction`

The action's 20 MB cap (line 58) can be raised or kept. With the async
path, large files go to R2 first, then the worker processes them. But
the server action still needs to receive the full file in the request
body (Vercel's 4 MB server-action limit applies). For files >4 MB,
consider a presigned R2 upload URL approach in a future enhancement.
For now, keep the 20 MB cap but route >=4 MB through the async path.

### 14. Update admin UI to show `ingest_status`

In the documents table (`src/app/(app)/admin/documents/...`), add a
badge column showing `queued` / `ingesting` / `done` / `failed`. Use
SWR or polling to refresh the list when there are `queued` or
`ingesting` documents.

### 15. Update tests

- Add `src/app/api/admin/ingest-worker/route.test.ts`:
  - Signature verification failure → 401
  - Invalid `documentId` → 400
  - Happy path → 200, chunks inserted, `ingest_status = 'done'`
  - Embed API failure → 500 (QStash will retry)
- Update `actions.test.ts` to cover the `status: 'queued'` return.

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| `QSTASH_TOKEN` | no | — | If set, async ingest is enabled |
| `QSTASH_CURRENT_SIGNING_KEY` | if `QSTASH_TOKEN` set | — | QStash signature verification |
| `QSTASH_NEXT_SIGNING_KEY` | if `QSTASH_TOKEN` set | — | QStash signature verification (rotation) |
| `QSTASH_INGEST_WORKER_URL` | if `QSTASH_TOKEN` set | — | Public URL of the deployment (e.g., `https://your-app.vercel.app`) |

---

## Schema / Migration Changes

- **New migration**: `ALTER TABLE documents ADD COLUMN ingest_status text NOT NULL DEFAULT 'done';`
- The `documents` table now has `ingestStatus` in the Drizzle schema.

---

## What Changed in the Codebase Structure

New files:
- `packages/infrastructure/src/queue/qstash-queue.ts`
- `packages/infrastructure/src/queue/sync-queue.ts`
- `packages/infrastructure/src/queue/index.ts`
- `src/app/api/admin/ingest-worker/route.ts`
- `src/app/api/admin/ingest-worker/route.test.ts`
- `drizzle/0002_*.sql` (generated migration)

Modified:
- `packages/domain/src/ports.ts` — `IngestQueue` port,
  `DocumentRepository.updateIngestStatus`
- `packages/infrastructure/src/db/schema.ts` — `ingestStatus` column
- `packages/infrastructure/src/db/repositories.ts` —
  `updateIngestStatus`, `createDocumentRepo`
- `packages/application/src/admin/documents.ts` — `uploadPdf` splits
  into sync/queued paths, `IngestResult.status` adds `'queued'`
- `src/composition.ts` — `ingestQueuedDocument`, `ingestQueue` wiring
- `src/app/(app)/admin/actions.ts` — minimal changes
- `src/app/(app)/admin/documents/` — UI badge for `ingest_status`
- `package.json` — `@upstash/qstash` added

---

## Gotchas / Things to Watch Out For

1. **Vercel 4 MB server-action limit**: The `bodySizeLimit: '4mb'` in
   `next.config.ts` applies to server action requests. Files >4 MB
   can't be uploaded via server actions on Vercel. The async path
   helps with processing time but not with the upload limit. For >4 MB
   uploads, a future enhancement should use presigned R2 upload URLs
   (client uploads directly to R2, bypassing the server action). This
   is out of scope for this session — document it as a known
   limitation.

2. **`QSTASH_INGEST_WORKER_URL` must be public**: QStash calls back
   over the public internet. For local dev, this won't work — use the
   sync path (no `QSTASH_TOKEN`). For Vercel preview deploys, use the
   preview URL.

3. **QStash signature verification**: The `Receiver.verify` call is
   async and uses the body as a string. Make sure you read the body as
   text before parsing JSON. Don't use `req.json()` (it consumes the
   stream) — use `req.text()` first, then `JSON.parse()`.

4. **Idempotent worker**: If QStash retries (e.g., after a timeout),
   the worker may be called twice for the same `documentId`. Make the
   worker idempotent: check `ingest_status` before processing. If
   already `'done'`, return 200 without re-processing. If
   `'ingesting'`, return 409 (QStash will retry later).

5. **`replacePdf` with async path**: The `replacePdf` use-case also
   needs the sync/queued split. When replacing a large PDF, the old
   chunks should be deleted (already handled by `ingestFile` which
   deletes the existing doc and re-inserts), and the new PDF goes
   through the queue.

6. **`ingest_status` in list queries**: The `listDocuments` query
   should include `ingestStatus` in the select so the admin UI can
   show the badge.

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run — all tests must pass
pnpm arch         # dependency-cruiser
```

After validation, test locally (sync path, no `QSTASH_TOKEN`):
```bash
pnpm dev
# Upload a small PDF via /admin/upload → should work synchronously as before
# Verify ingest_status = 'done' in the documents list
```

If you have a QStash token and a public URL, test the async path:
```bash
# Set QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY,
# QSTASH_INGEST_WORKER_URL in .env.local
pnpm dev  # or deploy to Vercel preview
# Upload a PDF → should return immediately with status: 'queued'
# Wait for QStash callback → ingest_status should flip to 'done'
```

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-04): add QStash async ingest queue for PDF processing

Add IngestQueue port with QStash and sync (no-op) adapters. Split
uploadPdf into sync (<4MB) and queued (>=4MB) paths. Add
ingest-worker route with signature verification. Track
ingest_status on documents table.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-04.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

Write `docs/execution-plan/context/after-session-04.md`. Include:

1. **The exact migration filename** for the `ingest_status` column.
2. **The sync/async split logic**: what triggers each path (file size,
   `QSTASH_TOKEN` presence).
3. **The ingest-worker route**: URL, signature verification, idempotency
   approach.
4. **Known limitation**: the 4 MB Vercel server-action upload limit
   (presigned R2 uploads are a future enhancement).
5. **Tell the next agent**: "Async PDF ingest is implemented via
   QStash. Small PDFs (<4 MB) go through the sync path. Large PDFs
   (>=4 MB, when `QSTASH_TOKEN` is set) are queued. The
   `documents.ingest_status` column tracks progress. The worker route
   is at `/api/admin/ingest-worker`. The `IngestQueue` port is in
   `packages/domain/src/ports.ts`. Read
   `packages/infrastructure/src/queue/` for the adapters."

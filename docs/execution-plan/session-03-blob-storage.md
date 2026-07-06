# Session 03: Blob Storage — `bytea` → Object Storage (R2 / S3 / Filesystem)

## Objective

Move PDF `bytea` blobs out of Postgres into object storage. Introduce a
`BlobStorage` port in the domain layer with three adapters: Cloudflare
R2 (production default, S3-compatible), S3/MinIO (self-host), and
filesystem (local dev). The `documents.blob` column becomes
`documents.storage_key`. This unblocks large PDFs, streaming previews,
and removes Neon row-size pressure.

This is the largest session in the plan.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

No Docker or external services needed for this session — the filesystem
adapter is the default and works without any external service.

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-02.md` first. The LLM
provider switch from Session 2 should be complete. Key things to know:

- `EMBEDDING_PROVIDER` / `CHAT_PROVIDER` env vars are in place.
- `Llm.getEmbeddingService()` and `Llm.getChatModel()` are the factory
  functions.
- Ollama works for zero-key local testing.

### Files to Read First

- `packages/infrastructure/src/db/schema.ts` — `documents.blob` column
  (line 16, `byteaBlob('blob')`)
- `packages/infrastructure/src/storage/bytea-blob.ts` — bytea custom
  type
- `packages/infrastructure/src/db/repositories.ts` —
  `updateDocumentBlob` (line 48), `listDocuments` (line 128, selects
  `null::bytea` and `hasBlob`), `createDocumentRepo` (line 400, maps
  `saveBlob`/`updateBlob`)
- `packages/domain/src/ports.ts` — `DocumentRepository` interface
  (line 43), includes `saveBlob` and `updateBlob`
- `packages/application/src/admin/documents.ts` — `uploadPdf` (line 96,
  calls `tx.documents.updateBlob`), `replacePdf` (line 191, same)
- `packages/application/src/rag/ingest.ts` — `IngestDeps` interface
  (line 22), does NOT touch blobs directly
- `src/app/api/admin/documents/[id]/blob/route.ts` — streams
  `auth.document.blob` as response
- `src/app/api/admin/documents/[id]/download/route.ts` — same
- `src/composition.ts` — `requireAdminDocument` (line 160, checks
  `doc.blob`), `ingestDeps` (line 40)
- `src/app/(app)/admin/actions.ts` — `uploadPdfAction` (line 44, 20 MB
  cap)

---

## Implementation

### Phase 1: New Port + Adapters

#### 1. Add `BlobStorage` port to `packages/domain/src/ports.ts`

Add after the existing ports (before the Misc section):

```typescript
export interface BlobStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  signedUrl?(key: string, ttlSec: number): Promise<string>;
}
```

#### 2. Create `packages/infrastructure/src/storage/blob-storage-fs.ts`

Filesystem adapter for local dev. Writes to `BLOB_FS_DIR` (default
`./.blobs`).

```typescript
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { BlobStorage } from '@app/domain';

export function createFilesystemBlobStorage(): BlobStorage {
  const baseDir = process.env.BLOB_FS_DIR ?? './.blobs';
  return {
    async put(key, body) {
      const path = join(baseDir, key);
      await fs.mkdir(join(path, '..'), { recursive: true });
      await fs.writeFile(path, body);
    },
    async get(key) {
      return fs.readFile(join(baseDir, key));
    },
    async stream(key) {
      const path = join(baseDir, key);
      const buffer = await fs.readFile(path);
      return new Response(buffer).body as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await fs.unlink(join(baseDir, key)).catch(() => {});
    },
  };
}
```

#### 3. Create `packages/infrastructure/src/storage/blob-storage-r2.ts`

R2 adapter using `@aws-sdk/client-s3` (S3-compatible API):

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl } from '@aws-sdk/client-s3';
import type { BlobStorage } from '@app/domain';

export function createR2BlobStorage(): BlobStorage {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET must be set.');
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await resp.Body!.transformToByteArray());
    },
    async stream(key) {
      const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return resp.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async signedUrl(key, ttlSec) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSec });
    },
  };
}
```

#### 4. Create `packages/infrastructure/src/storage/blob-storage-s3.ts`

Same as R2 but with standard AWS endpoint. Doubles as MinIO adapter
(via `S3_ENDPOINT` env var):

```typescript
import { S3Client, ... } from '@aws-sdk/client-s3';
// Same interface as R2 but endpoint defaults to AWS
// S3_ENDPOINT env var overrides for MinIO
```

#### 5. Create `packages/infrastructure/src/storage/blob-storage-factory.ts`

```typescript
import type { BlobStorage } from '@app/domain';
import { createFilesystemBlobStorage } from './blob-storage-fs';
import { createR2BlobStorage } from './blob-storage-r2';
import { createS3BlobStorage } from './blob-storage-s3';

export function createBlobStorage(): BlobStorage {
  const provider = process.env.BLOB_STORAGE_PROVIDER ?? 'filesystem';
  switch (provider) {
    case 'filesystem': return createFilesystemBlobStorage();
    case 'r2': return createR2BlobStorage();
    case 's3': return createS3BlobStorage();
    default: throw new Error(`Unknown BLOB_STORAGE_PROVIDER: ${provider}`);
  }
}
```

#### 6. Add `@aws-sdk/client-s3` to `package.json` dependencies

```bash
pnpm add @aws-sdk/client-s3
```

### Phase 2: Schema Migration

#### 7. Modify `packages/infrastructure/src/db/schema.ts`

Replace line 16:
```typescript
// Was: blob: byteaBlob('blob'),
storageKey: text('storage_key'),
```

#### 8. Generate migration

```bash
pnpm db:generate
```

This produces a new migration file in `drizzle/` (e.g.,
`drizzle/0001_<name>.sql`) that adds `storage_key` column. Review the
generated SQL. It should be:
```sql
ALTER TABLE "documents" ADD COLUMN "storage_key" text;
```

**Do NOT drop the `blob` column yet** — that happens in a later
migration after the backfill script (step 10) has moved all existing
blobs to the blob store.

#### 9. Update `packages/infrastructure/src/storage/bytea-blob.ts`

Keep the file for now — it's needed for the backfill script. It will be
deleted in a later migration after all blobs are moved.

### Phase 3: Backfill Script

#### 10. Create `scripts/backfill-blobs.ts`

A tsx script that:
1. Reads every `documents` row that has a non-null `blob` and a null
   `storage_key`.
2. For each row, calls `blobStorage.put('docs/{id}/{fileName}', blob,
   'application/pdf')`.
3. Updates the row's `storage_key` to the key.
4. Commits.
5. Is idempotent — skips rows that already have a `storage_key`.

```bash
pnpm tsx scripts/backfill-blobs.ts
```

This script reads the old `blob` column directly via a raw SQL query
(since the schema no longer has `blob` in the Drizzle schema, use
`db.execute(sql\`SELECT id, file_name, blob, storage_key FROM documents WHERE blob IS NOT NULL AND storage_key IS NULL\`)`).

### Phase 4: Repository + Use-Case Layer

#### 11. Update `packages/domain/src/ports.ts` — `DocumentRepository`

Replace:
```typescript
saveBlob(id: number, blob: Buffer): Promise<void>;
updateBlob(id: number, blob: Buffer): Promise<void>;
```
With:
```typescript
setStorageKey(id: number, key: string): Promise<void>;
```

Add:
```typescript
// In DocumentRow interface, replace:
//   blob: Buffer | null;
// With:
storageKey: string | null;
```

#### 12. Update `packages/infrastructure/src/db/repositories.ts`

- Replace `updateDocumentBlob` (line 48) with `setDocumentStorageKey`:
  ```typescript
  export async function setDocumentStorageKey(id: number, key: string, client: Client = db): Promise<void> {
    await client.update(documents).set({ storageKey: key }).where(eq(documents.id, id));
  }
  ```
- Update `createDocumentRepo` (line 400): replace `saveBlob`/`updateBlob`
  with `setStorageKey`.
- Update `listDocuments` (line 128): replace the `null::bytea` and
  `hasBlob` columns with `storage_key` and `hasBlob = storage_key IS NOT
  NULL`:
  ```typescript
  storageKey: documents.storageKey,
  hasBlob: sql<boolean>`${documents.storageKey} IS NOT NULL`.as('hasBlob'),
  // Remove: blob: sql<Buffer | null>`null::bytea`.as('blob'),
  ```

#### 13. Update `packages/application/src/admin/documents.ts`

- `uploadPdf` (line 96): after `ingestFile` returns the document id,
  call `blobStorage.put(key, buffer)` then
  `tx.documents.setStorageKey(id, key)`. Add `blobStorage: BlobStorage`
  to the deps.
- `replacePdf` (line 191): same change.
- `listDocuments` (line 42): the return type changes `blob: Buffer | null`
  to `storageKey: string | null`.

#### 14. Update `packages/application/src/rag/ingest.ts`

No changes to `ingestFile` itself — it only deals with text/chunks, not
blobs. But `IngestDeps` (line 22) gets a new field:
```typescript
export interface IngestDeps {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  embeddings: EmbeddingService;
  hasher: Hasher;
  pdfParser: PdfParser;
  textSplitter: TextSplitter;
  blobStorage: BlobStorage;  // <-- new
}
```

Actually, `ingestFile` doesn't use `blobStorage` — it's used by
`uploadPdf`/`replacePdf` wrappers. To keep `ingestFile` clean, add
`blobStorage` to the `uploadPdf`/`replacePdf` deps directly, not to
`IngestDeps`. Decide based on what's cleaner — the plan recommends
adding it to the `uploadPdf`/`replacePdf` deps, not `IngestDeps`.

#### 15. Update `src/composition.ts`

- Add `blobStorage` to the composition:
  ```typescript
  import { createBlobStorage } from '@app/infrastructure/storage/blob-storage-factory';
  const blobStorage = createBlobStorage();
  ```
- Update `uploadPdf` and `replacePdf` deps to include `blobStorage`.
- Update `requireAdminDocument` (line 160): replace `if (!doc.blob)` with
  `if (!doc.storageKey)`.

### Phase 5: Routes

#### 16. Update `src/app/api/admin/documents/[id]/blob/route.ts`

Replace:
```typescript
return new NextResponse(new Uint8Array(auth.document.blob!), { ... });
```
With:
```typescript
const comp = auth.comp;
const storageKey = auth.document.storageKey!;
if (comp.blobStorage.signedUrl) {
  const url = await comp.blobStorage.signedUrl(storageKey, 300);
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
// Fallback: stream from the adapter
const stream = await comp.blobStorage.stream(storageKey);
return new NextResponse(stream, {
  status: 200,
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${safeName}"`,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  },
});
```

Add `blobStorage` to the `Composition` type and `createComposition()`.

#### 17. Update `src/app/api/admin/documents/[id]/download/route.ts`

Same pattern as blob route, but with
`Content-Disposition: attachment; filename="..."`.

#### 18. Update `src/app/(app)/admin/actions.ts` — `uploadPdfAction`

The action calls `getComposition().uploadPdf(...)` which now handles
the blob storage internally. The action itself doesn't change much —
it passes the buffer to the use-case, and the use-case puts it in the
blob store. The 20 MB cap (line 58) stays for now (Session 4 will add
async ingest for larger files).

#### 19. Update tests

- `src/app/api/admin/documents/[id]/blob/route.test.ts`: mock
  `BlobStorage.stream` / `signedUrl` instead of `doc.blob`.
- `src/app/(app)/admin/actions.test.ts`: update `uploadPdfMock` to
  reflect the new `uploadPdf` signature (takes `blobStorage` in deps).
- Any test that checks `doc.blob` should check `doc.storageKey` instead.

### Phase 6: Hard-delete blob cleanup

#### 20. Update `hardDeleteDocument` use-case

When a document is hard-deleted, also delete the blob from the blob
store. Add `blobStorage.delete(storageKey)` to the
`hardDeleteDocument` use-case in `documents.ts`.

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| `BLOB_STORAGE_PROVIDER` | no | `filesystem` | `filesystem` \| `r2` \| `s3` |
| `BLOB_FS_DIR` | no | `./.blobs` | Filesystem adapter base dir |
| `R2_ACCOUNT_ID` | if `r2` | — | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | if `r2` | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | if `r2` | — | R2 secret |
| `R2_BUCKET` | if `r2` | — | R2 bucket name |
| `S3_REGION` | if `s3` | — | AWS region |
| `S3_ACCESS_KEY_ID` | if `s3` | — | AWS access key |
| `S3_SECRET_ACCESS_KEY` | if `s3` | — | AWS secret |
| `S3_BUCKET` | if `s3` | — | S3 bucket name |
| `S3_ENDPOINT` | if `s3` (MinIO) | — | Custom S3 endpoint |

---

## Schema / Migration Changes

- **Migration `0001`**: `ALTER TABLE documents ADD COLUMN storage_key text;`
- **Backfill script**: `scripts/backfill-blobs.ts` — moves existing
  `bytea` blobs to the blob store and sets `storage_key`.
- **Future migration** (after backfill is confirmed): `ALTER TABLE
  documents DROP COLUMN blob;` — this is NOT done in this session. It
  should be done in a later PR after the backfill has run in production
  and every row has a `storage_key`.
- **`bytea-blob.ts`** is kept for now (backfill script needs it).
  Delete it after the `DROP COLUMN blob` migration.

---

## What Changed in the Codebase Structure

New files:
- `packages/infrastructure/src/storage/blob-storage-fs.ts`
- `packages/infrastructure/src/storage/blob-storage-r2.ts`
- `packages/infrastructure/src/storage/blob-storage-s3.ts`
- `packages/infrastructure/src/storage/blob-storage-factory.ts`
- `scripts/backfill-blobs.ts`
- `drizzle/0001_*.sql` (generated migration)

Modified:
- `packages/domain/src/ports.ts` — `BlobStorage` port,
  `DocumentRepository` changes, `DocumentRow` changes
- `packages/infrastructure/src/db/schema.ts` — `blob` → `storageKey`
- `packages/infrastructure/src/db/repositories.ts` —
  `setDocumentStorageKey`, `listDocuments` query, `createDocumentRepo`
- `packages/application/src/admin/documents.ts` — `uploadPdf`,
  `replacePdf`, `hardDeleteDocument`, `listDocuments` return type
- `src/composition.ts` — `blobStorage` wiring
- `src/app/api/admin/documents/[id]/blob/route.ts` — stream/redirect
- `src/app/api/admin/documents/[id]/download/route.ts` — stream/redirect
- `src/app/(app)/admin/actions.ts` — minimal changes
- `package.json` — `@aws-sdk/client-s3` added

---

## Gotchas / Things to Watch Out For

1. **`DocumentRow` type change**: The `blob: Buffer | null` →
   `storageKey: string | null` change ripples through every type that
   references `DocumentRow`. Search for all usages and update them.

2. **`listDocuments` return shape**: The admin documents table UI
   reads `hasBlob` and `blob` from the response. Update the UI
   component to read `storageKey` / `hasBlob` instead of `blob`.

3. **Backfill script needs the old `blob` column**: The Drizzle schema
   no longer has `blob`, but the database column still exists until the
   `DROP COLUMN` migration. The backfill script must use raw SQL
   (`db.execute(sql\`SELECT id, file_name, blob FROM documents WHERE
   blob IS NOT NULL AND storage_key IS NULL\`)`) to read the old
   column.

4. **R2 signed URLs**: The blob route redirects to a signed URL for R2.
   This means the PDF is served directly from R2's edge, not through
   the Vercel function. This is better for performance but means the
   CSP `frame-src` header in `next.config.ts` may need updating to
   allow the R2 domain. Check `next.config.ts` line 40 (`frame-src`).

5. **`hardDeleteDocument` must clean up blobs**: If a document is
   hard-deleted but the blob isn't deleted from R2/S3/filesystem, you
   have orphaned blobs. Make sure the use-case calls
   `blobStorage.delete(storageKey)` before deleting the DB row.

6. **Tests that mock `doc.blob`**: Several tests check `doc.blob`. Search
   for `.blob` in test files and update to `.storageKey`.

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit — watch for DocumentRow type errors
pnpm lint         # eslint
pnpm test         # vitest run — all tests must pass (update blob tests)
pnpm arch         # dependency-cruiser — new files in infrastructure, port in domain
```

After validation, test locally with the filesystem adapter:
```bash
# In .env.local:
BLOB_STORAGE_PROVIDER=filesystem
BLOB_FS_DIR=./.blobs

pnpm dev
# Upload a PDF via /admin/upload
# Verify ./.blobs/docs/{id}/{fileName} exists
# Verify the preview route (/api/admin/documents/[id]/blob) streams it
# Verify download route works
# Verify hard-delete removes the file
```

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-03): move PDF bytea blobs to object storage (R2/S3/fs)

Add BlobStorage port with R2, S3, and filesystem adapters. Replace
documents.blob (bytea) with documents.storage_key (text). Add
backfill script. Update blob/download routes to stream from store.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-03.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

Write `docs/execution-plan/context/after-session-03.md`. Include:

1. **The exact migration filename** generated by `pnpm db:generate`.
2. **The `DocumentRow` shape change**: `blob: Buffer | null` →
   `storageKey: string | null`. List every file that was updated due
   to this change.
3. **The `BlobStorage` port shape** and which adapters are implemented.
4. **The backfill script**: how to run it, what it does, and that the
   `DROP COLUMN blob` migration is deferred to a future PR.
5. **CSP header changes** (if any were needed for R2 signed URLs).
6. **Tell the next agent**: "PDFs are now stored in object storage
   (R2/S3/filesystem) via a `BlobStorage` port. The `documents.blob`
   column is replaced by `documents.storage_key`. The backfill script
   is at `scripts/backfill-blobs.ts`. The blob route streams from or
   redirects to the blob store. The `Composition` type now includes
   `blobStorage`. Read `packages/infrastructure/src/storage/` for the
   adapters and `packages/domain/src/ports.ts` for the port."

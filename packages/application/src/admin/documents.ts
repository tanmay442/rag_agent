// Admin document use-cases: list, upload, replace, soft-delete,
// restore, hard-delete, recount.
import { Effect } from 'effect';
import {
  Documents,
  Chunks,
  Users,
  TransactionRunner,
  BlobStorage,
  IngestQueue,
  Clock,
  Hasher,
  NotFoundError,
  ValidationError,
  GoneError,
} from '@app/domain';
import { ingestFile } from '../rag/ingest';
import { sanitizePagination } from '../pagination';
import { RESTORE_WINDOW_MS, MAX_LIST_LIMIT } from '../../../../config/constants';

/** Build the object-storage key for a document's PDF binary. The key
 *  is namespaced under `docs/` and prefixed by the document id so that
 *  renaming a file (or two different docs sharing a sanitized name)
 *  can never collide. */
function blobKey(documentId: number, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return `docs/${documentId}/${safe}`;
}

interface ListDocumentsInput {
  search?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export const listDocuments = Effect.fn('Admin.listDocuments')(
  function* (input: ListDocumentsInput) {
    const documents = yield* Documents;
    const chunks = yield* Chunks;
    const users = yield* Users;
    const { limit, offset } = sanitizePagination(input.limit, input.offset, MAX_LIST_LIMIT);
    const { documents: docs, total } = yield* documents.list({
      search: input.search,
      includeDeleted: input.includeDeleted,
      limit,
      offset,
    });
    const ids = docs.map((d) => d.id);
    const chunkCounts =
      ids.length > 0 ? yield* chunks.countForDocuments(ids) : new Map<number, number>();
    const uploaderIds = [...new Set(docs.map((d) => d.uploadedBy))];
    const uploaders = uploaderIds.length > 0 ? yield* users.findByIds(uploaderIds) : [];
    const uploaderMap = new Map<string, string | null>();
    for (const u of uploaders) uploaderMap.set(u.clerkUserId, u.name ?? null);
    const result = docs.map((d) => ({
      ...d,
      hasBlob: Boolean(d.hasBlob),
      uploaderName: uploaderMap.get(d.uploadedBy) ?? null,
      chunkCount: chunkCounts.get(d.id) ?? 0,
    }));
    return { documents: result, total };
  },
);

/** Files at or above this size go through the async QStash ingest path
 *  (when `QSTASH_TOKEN` is set). Smaller files ingest synchronously.
 *  4 MB matches Vercel's server-action request body limit. */
const ASYNC_INGEST_THRESHOLD = 4 * 1024 * 1024;

function asyncIngestEnabled(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

export const uploadPdf = Effect.fn('Admin.uploadPdf')(
  function* (input: { fileName: string; buffer: Buffer; actorId: string }) {
    if (input.buffer.length >= ASYNC_INGEST_THRESHOLD && asyncIngestEnabled()) {
      return yield* queuePdfForIngest(input, (newId) => ({ action: 'upload', documentId: newId }));
    }
    return yield* uploadPdfSync(input);
  },
);

/** Synchronous ingest: parse, embed, insert chunks, put blob, set
 *  storage key — all in a transaction. Used for small PDFs (<4 MB)
 *  or always when `QSTASH_TOKEN` is unset. */
function uploadPdfSync(input: {
  fileName: string;
  buffer: Buffer;
  actorId: string;
}) {
  return Effect.gen(function* () {
    const runner = yield* TransactionRunner;
    const blobStorage = yield* BlobStorage;
    return yield* runner.run((ctx) =>
      Effect.gen(function* () {
        const r = yield* ingestFile({
          fileName: input.fileName,
          buffer: input.buffer,
          uploadedBy: input.actorId,
        }).pipe(
          Effect.provideService(Documents, ctx.documents),
          Effect.provideService(Chunks, ctx.chunks),
        );
        const key = blobKey(r.documentId, input.fileName);
        yield* blobStorage.put(key, input.buffer, 'application/pdf');
        yield* ctx.documents.setStorageKey(r.documentId, key);
        yield* ctx.audit.logDocumentEvent({
          action: r.status === 'inserted' ? 'upload' : 'replace',
          documentId: r.documentId,
          actorId: input.actorId,
        });
        return r;
      }),
    );
  });
}

/** Asynchronous ingest core: store the blob, insert a `documents` row
 *  with `ingest_status='queued'`, and enqueue a QStash message. No
 *  parsing/embedding happens here — the worker does that on callback.
 *  `auditFor` receives the new row's id so the caller can choose the
 *  audit action/documentId (upload logs the new id; replace logs the
 *  original documentId). */
function queuePdfForIngest(
  input: { fileName: string; buffer: Buffer; actorId: string },
  auditFor: (newDocumentId: number) => { action: 'upload' | 'replace'; documentId: number },
) {
  return Effect.gen(function* () {
    const documents = yield* Documents;
    const hasher = yield* Hasher;
    const blobStorage = yield* BlobStorage;
    const runner = yield* TransactionRunner;
    const ingestQueue = yield* IngestQueue;
    const fileHash = yield* hasher.sha256(input.buffer);
    const existing = yield* documents.findByName(input.fileName);
    if (existing && existing.fileHash === fileHash) {
      return { documentId: existing.id, chunks: 0, status: 'unchanged' as const };
    }
    if (existing && existing.storageKey) {
      // Best-effort: an orphaned blob is preferable to blocking the re-upload.
      yield* blobStorage.delete(existing.storageKey).pipe(Effect.catchAll(() => Effect.void));
    }
    const inserted = yield* runner.run((ctx) =>
      Effect.gen(function* () {
        if (existing && existing.fileHash !== fileHash) {
          yield* ctx.documents.deleteById(existing.id);
        }
        const row = yield* ctx.documents.insert({
          fileName: input.fileName,
          fileHash,
          uploadedBy: input.actorId,
        });
        const key = blobKey(row.id, input.fileName);
        yield* blobStorage.put(key, input.buffer, 'application/pdf');
        yield* ctx.documents.setStorageKey(row.id, key);
        yield* ctx.documents.updateIngestStatus(row.id, 'queued');
        const a = auditFor(row.id);
        yield* ctx.audit.logDocumentEvent({
          action: a.action,
          documentId: a.documentId,
          actorId: input.actorId,
        });
        return row;
      }),
    );
    // If QStash publish fails, mark `failed` so the UI doesn't show a
    // forever-`queued` doc; a future re-drive can re-enqueue.
    yield* ingestQueue.enqueue({ documentId: inserted.id }).pipe(
      Effect.catchAll((e) =>
        documents
          .updateIngestStatus(inserted.id, 'failed')
          .pipe(Effect.catchAll(() => Effect.void), Effect.zipRight(Effect.fail(e))),
      ),
    );
    return { documentId: inserted.id, chunks: 0, status: 'queued' as const };
  });
}

export const softDeleteDocument = Effect.fn('Admin.softDeleteDocument')(
  function* (input: { documentId: number; actorId: string }) {
    const documents = yield* Documents;
    const runner = yield* TransactionRunner;
    const existing = yield* documents.findById(input.documentId);
    if (!existing) return yield* new NotFoundError(`Document not found: ${input.documentId}`);
    yield* runner.run((ctx) =>
      Effect.gen(function* () {
        yield* ctx.documents.softDelete(input.documentId, new Date());
        yield* ctx.audit.logDocumentEvent({
          action: 'delete',
          documentId: input.documentId,
          actorId: input.actorId,
        });
      }),
    );
  },
);

export const restoreDocument = Effect.fn('Admin.restoreDocument')(
  function* (documentId: number, actorId: string) {
    const documents = yield* Documents;
    const clock = yield* Clock;
    const runner = yield* TransactionRunner;
    const doc = yield* documents.findById(documentId);
    if (!doc) return yield* new NotFoundError('Document not found');
    if (!doc.deletedAt) return yield* new ValidationError('Document is not deleted');
    const now = yield* clock.now();
    if (now.getTime() - doc.deletedAt.getTime() > RESTORE_WINDOW_MS) {
      return yield* new GoneError('Restore window expired');
    }
    yield* runner.run((ctx) =>
      Effect.gen(function* () {
        yield* ctx.documents.restore(documentId);
        yield* ctx.audit.logDocumentEvent({ action: 'restore', documentId, actorId });
      }),
    );
  },
);

export const getDocumentById = Effect.fn('Admin.getDocumentById')(
  function* (documentId: number) {
    const documents = yield* Documents;
    const doc = yield* documents.findById(documentId);
    return { document: doc };
  },
);

export const hardDeleteDocument = Effect.fn('Admin.hardDeleteDocument')(
  function* (input: { documentId: number; actorId: string }) {
    const documents = yield* Documents;
    const runner = yield* TransactionRunner;
    const blobStorage = yield* BlobStorage;
    const existing = yield* documents.findById(input.documentId);
    if (!existing) return yield* new NotFoundError(`Document not found: ${input.documentId}`);
    const storageKey = existing.storageKey;
    yield* runner.run((ctx) =>
      Effect.gen(function* () {
        yield* ctx.audit.logDocumentEvent({
          action: 'delete',
          documentId: input.documentId,
          actorId: input.actorId,
        });
        yield* ctx.documents.deleteById(input.documentId);
      }),
    );
    if (storageKey) {
      // Best-effort: an orphaned blob is preferable to failing the hard-delete.
      yield* blobStorage.delete(storageKey).pipe(Effect.catchAll(() => Effect.void));
    }
  },
);

export const replacePdf = Effect.fn('Admin.replacePdf')(
  function* (input: { documentId: number; fileName: string; buffer: Buffer; actorId: string }) {
    const documents = yield* Documents;
    const existing = yield* documents.findById(input.documentId);
    if (!existing) return yield* new NotFoundError(`Document not found: ${input.documentId}`);
    if (input.buffer.length >= ASYNC_INGEST_THRESHOLD && asyncIngestEnabled()) {
      return yield* queuePdfForIngest(
        input,
        () => ({ action: 'replace', documentId: input.documentId }),
      );
    }
    const runner = yield* TransactionRunner;
    const blobStorage = yield* BlobStorage;
    return yield* runner.run((ctx) =>
      Effect.gen(function* () {
        const r = yield* ingestFile({
          fileName: input.fileName,
          buffer: input.buffer,
          uploadedBy: input.actorId,
        }).pipe(
          Effect.provideService(Documents, ctx.documents),
          Effect.provideService(Chunks, ctx.chunks),
        );
        const key = blobKey(r.documentId, input.fileName);
        yield* blobStorage.put(key, input.buffer, 'application/pdf');
        yield* ctx.documents.setStorageKey(r.documentId, key);
        if (r.status !== 'unchanged') {
          yield* ctx.audit.logDocumentEvent({
            action: 'replace',
            documentId: input.documentId,
            actorId: input.actorId,
          });
        }
        return r;
      }),
    );
  },
);

export const recountChunksForDocument = Effect.fn('Admin.recountChunksForDocument')(
  function* (documentId: number) {
    const chunks = yield* Chunks;
    const count = yield* chunks.countForDocument(documentId);
    return { documentId, count };
  },
);

export const recountChunksForAllDocuments = Effect.fn('Admin.recountChunksForAllDocuments')(
  function* () {
    const chunks = yield* Chunks;
    return yield* chunks.recountAll();
  },
);

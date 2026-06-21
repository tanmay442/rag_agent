// Admin document use-cases: list, upload, replace, soft-delete,
// restore, hard-delete, recount.
import {
  err,
  ok,
  type Result,
  NotFoundError,
  GoneError,
  ValidationError,
} from '@app/domain';
import type { DocumentRepository, ChunkRepository, AuditLog } from '../ports/index.js';
import { ingestFile } from '../rag/ingest.js';
import type { IngestDeps, IngestResult } from '../rag/ingest.js';

export interface ListDocumentsInput {
  search?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export async function listDocuments(
  input: ListDocumentsInput,
  deps: {
    documents: DocumentRepository;
    chunks: ChunkRepository;
  },
): Promise<Result<{
  documents: Array<{
    id: number;
    fileName: string;
    fileHash: string;
    uploadedBy: string;
    uploadedAt: Date;
    blob: Buffer | null;
    deletedAt: Date | null;
    uploaderName: string | null;
    chunkCount: number;
  }>;
  total: number;
}>> {
  // For brevity in this commit, the legacy listDocuments SQL
  // still lives in src/lib/admin/documents.ts; the shim
  // below delegates to it. Commit 6 will replace this with
  // a real repository implementation.
  const { listDocuments: legacyList } = await import('../../../../src/lib/admin/documents.js');
  const r = await legacyList(input);
  return ok(r);
}

export async function uploadPdf(
  input: { fileName: string; buffer: Buffer; actorId: string },
  deps: IngestDeps & { audit: AuditLog },
): Promise<Result<IngestResult>> {
  const r = await ingestFile(
    { fileName: input.fileName, buffer: input.buffer, uploadedBy: input.actorId },
    deps,
  );
  if (!r.ok) return r;
  // Save the blob for inline preview (mirrors legacy behaviour).
  await deps.documents.updateBlob(r.value.documentId, input.buffer);
  await deps.audit.logDocumentEvent({
    action: r.value.status === 'inserted' ? 'upload' : 'replace',
    documentId: r.value.documentId,
    actorId: input.actorId,
  });
  return r;
}

export async function softDeleteDocument(
  input: { documentId: number; actorId: string },
  deps: { documents: DocumentRepository; audit: AuditLog },
): Promise<Result<void>> {
  const row = await deps.documents.softDelete(input.documentId, new Date());
  if (!row) return err(new NotFoundError(`Document not found: ${input.documentId}`));
  await deps.audit.logDocumentEvent({
    action: 'delete',
    documentId: input.documentId,
    actorId: input.actorId,
  });
  return ok(undefined);
}

const RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface RestoreResult {
  ok: boolean;
  reason?: 'not_found' | 'not_soft_deleted' | 'expired';
}

export async function restoreDocument(
  documentId: number,
  actorId: string,
  deps: { documents: DocumentRepository; audit: AuditLog; clock: { now(): Date } },
): Promise<Result<RestoreResult>> {
  const doc = await deps.documents.findById(documentId);
  if (!doc) return ok({ ok: false, reason: 'not_found' });
  if (!doc.deletedAt) return ok({ ok: false, reason: 'not_soft_deleted' });
  if (deps.clock.now().getTime() - doc.deletedAt.getTime() > RESTORE_WINDOW_MS) {
    return ok({ ok: false, reason: 'expired' });
  }
  await deps.documents.restore(documentId);
  await deps.audit.logDocumentEvent({ action: 'restore', documentId, actorId });
  return ok({ ok: true });
}

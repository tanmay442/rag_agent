// Admin document use-cases: list, upload, replace, soft-delete,
// restore, hard-delete, recount.
import {
  err,
  ok,
  type Result,
  NotFoundError,
} from '@app/domain';
import type { DocumentRepository, ChunkRepository, AuditLog, Clock, UserRepository } from '../ports/index';
import { ingestFile } from '../rag/ingest';
import type { IngestDeps, IngestResult } from '../rag/ingest';

interface ListDocumentsInput {
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
    users: UserRepository;
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
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const { documents, total } = await deps.documents.list({
    search: input.search,
    includeDeleted: input.includeDeleted,
    limit,
    offset,
  });
  const ids = documents.map((d) => d.id);
  const chunkCounts = ids.length > 0 ? await deps.chunks.countForDocuments(ids) : new Map<number, number>();
  const uploaderIds = [...new Set(documents.map((d) => d.uploadedBy))];
  const uploaderMap = new Map<string, string | null>();
  for (const uid of uploaderIds) {
    const user = await deps.users.findByClerkId(uid);
    uploaderMap.set(uid, user?.name ?? null);
  }
  const result = documents.map((d) => ({
    ...d,
    uploaderName: uploaderMap.get(d.uploadedBy) ?? null,
    chunkCount: chunkCounts.get(d.id) ?? 0,
  }));
  return ok({ documents: result, total });
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
  deps: { documents: DocumentRepository; audit: AuditLog; clock: Clock },
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

export async function getDocumentById(
  documentId: number,
  deps: { documents: DocumentRepository },
): Promise<Result<{ document: import('../ports/index').DocumentRow | null }>> {
  const doc = await deps.documents.findById(documentId);
  return ok({ document: doc });
}

export async function hardDeleteDocument(
  input: { documentId: number; actorId: string },
  deps: { documents: DocumentRepository; audit: AuditLog },
): Promise<Result<void>> {
  await deps.documents.deleteById(input.documentId);
  await deps.audit.logDocumentEvent({
    action: 'delete',
    documentId: input.documentId,
    actorId: input.actorId,
  });
  return ok(undefined);
}

export async function replacePdf(
  input: { documentId: number; fileName: string; buffer: Buffer; actorId: string },
  deps: IngestDeps & { audit: AuditLog },
): Promise<Result<IngestResult>> {
  const existing = await deps.documents.findById(input.documentId);
  if (!existing) return err(new NotFoundError(`Document not found: ${input.documentId}`));

  const r = await ingestFile(
    { fileName: input.fileName, buffer: input.buffer, uploadedBy: input.actorId },
    deps,
  );
  if (!r.ok) return r;
  await deps.documents.updateBlob(r.value.documentId, input.buffer);
  if (r.value.status !== 'unchanged') {
    await deps.audit.logDocumentEvent({
      action: 'replace',
      documentId: input.documentId,
      actorId: input.actorId,
    });
  }
  return r;
}

export async function recountChunksForDocument(
  documentId: number,
  deps: { chunks: ChunkRepository },
): Promise<Result<{ documentId: number; count: number }>> {
  const count = await deps.chunks.countForDocument(documentId);
  return ok({ documentId, count });
}

export async function recountChunksForAllDocuments(
  deps: { chunks: ChunkRepository },
): Promise<Result<Array<{ documentId: number; count: number }>>> {
  const rows = await deps.chunks.recountAll();
  return ok(rows);
}

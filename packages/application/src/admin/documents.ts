// Admin document use-cases: list, upload, replace, soft-delete,
// restore, hard-delete, recount.
import {
  err,
  ok,
  type Result,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
} from '@app/domain';
import type { DocumentRepository, ChunkRepository, AuditLog, Clock, UserRepository, TransactionRunner } from '../ports/index';
import { ingestFile } from '../rag/ingest';
import type { IngestDeps, IngestResult } from '../rag/ingest';
import { RESTORE_WINDOW_MS, MAX_LIST_LIMIT } from '../../../../config/constants';

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
  try {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), MAX_LIST_LIMIT);
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
  const uploaders = uploaderIds.length > 0 ? await deps.users.findByIds(uploaderIds) : [];
  const uploaderMap = new Map<string, string | null>();
  for (const u of uploaders) {
    uploaderMap.set(u.clerkUserId, u.name ?? null);
  }
  const result = documents.map((d) => ({
    ...d,
    uploaderName: uploaderMap.get(d.uploadedBy) ?? null,
    chunkCount: chunkCounts.get(d.id) ?? 0,
  }));
  return ok({ documents: result, total });
  } catch (e) {
    return err(new ExternalServiceError('Failed to list documents', e));
  }
}

export async function uploadPdf(
  input: { fileName: string; buffer: Buffer; actorId: string },
  deps: IngestDeps & { audit: AuditLog; runner: TransactionRunner },
): Promise<Result<IngestResult>> {
  try {
    // TODO: Large PDF blobs should be moved to external storage (S3/R2) instead of
    // being stored directly in the database to avoid DB size limits and improve performance.
    return await deps.runner.run(async (tx) => {
      const r = await ingestFile(
        { fileName: input.fileName, buffer: input.buffer, uploadedBy: input.actorId },
        { ...deps, documents: tx.documents, chunks: tx.chunks },
      );
      if (!r.ok) return r;
      await tx.documents.updateBlob(r.value.documentId, input.buffer);
      await tx.audit.logDocumentEvent({
        action: r.value.status === 'inserted' ? 'upload' : 'replace',
        documentId: r.value.documentId,
        actorId: input.actorId,
      });
      return r;
    });
  } catch (e) {
    return err(new ExternalServiceError('Failed to upload PDF', e));
  }
}

export async function softDeleteDocument(
  input: { documentId: number; actorId: string },
  deps: { documents: DocumentRepository; audit: AuditLog; runner: TransactionRunner },
): Promise<Result<void>> {
  try {
    const existing = await deps.documents.findById(input.documentId);
    if (!existing) return err(new NotFoundError(`Document not found: ${input.documentId}`));
    await deps.runner.run(async (tx) => {
      await tx.documents.softDelete(input.documentId, new Date());
      await tx.audit.logDocumentEvent({
        action: 'delete',
        documentId: input.documentId,
        actorId: input.actorId,
      });
    });
    return ok(undefined);
  } catch (e) {
    return err(new ExternalServiceError('Failed to soft-delete document', e));
  }
}

export interface RestoreResult {
  ok: boolean;
  reason?: 'not_found' | 'not_soft_deleted' | 'expired';
}

export async function restoreDocument(
  documentId: number,
  actorId: string,
  deps: { documents: DocumentRepository; audit: AuditLog; clock: Clock; runner: TransactionRunner },
): Promise<Result<RestoreResult>> {
  const doc = await deps.documents.findById(documentId);
  if (!doc) return ok({ ok: false, reason: 'not_found' });
  if (!doc.deletedAt) return ok({ ok: false, reason: 'not_soft_deleted' });
  if (deps.clock.now().getTime() - doc.deletedAt.getTime() > RESTORE_WINDOW_MS) {
    return ok({ ok: false, reason: 'expired' });
  }
  try {
    await deps.runner.run(async (tx) => {
      await tx.documents.restore(documentId);
      await tx.audit.logDocumentEvent({ action: 'restore', documentId, actorId });
    });
  } catch {
    return err(new ConflictError('Document restore transaction failed'));
  }
  return ok({ ok: true });
}

export async function getDocumentById(
  documentId: number,
  deps: { documents: DocumentRepository },
): Promise<Result<{ document: import('../ports/index').DocumentRow | null }>> {
  try {
  const doc = await deps.documents.findById(documentId);
  return ok({ document: doc });
  } catch (e) {
    return err(new ExternalServiceError('Failed to get document', e));
  }
}

export async function hardDeleteDocument(
  input: { documentId: number; actorId: string },
  deps: { documents: DocumentRepository; audit: AuditLog; runner: TransactionRunner },
): Promise<Result<void>> {
  try {
    const existing = await deps.documents.findById(input.documentId);
    if (!existing) return err(new NotFoundError(`Document not found: ${input.documentId}`));
    await deps.runner.run(async (tx) => {
      await tx.audit.logDocumentEvent({
        action: 'delete',
        documentId: input.documentId,
        actorId: input.actorId,
      });
      await tx.documents.deleteById(input.documentId);
    });
    return ok(undefined);
  } catch (e) {
    return err(new ExternalServiceError('Failed to hard-delete document', e));
  }
}

export async function replacePdf(
  input: { documentId: number; fileName: string; buffer: Buffer; actorId: string },
  deps: IngestDeps & { audit: AuditLog; runner: TransactionRunner },
): Promise<Result<IngestResult>> {
  try {
    const existing = await deps.documents.findById(input.documentId);
    if (!existing) return err(new NotFoundError(`Document not found: ${input.documentId}`));

    return await deps.runner.run(async (tx) => {
      const r = await ingestFile(
        { fileName: input.fileName, buffer: input.buffer, uploadedBy: input.actorId },
        { ...deps, documents: tx.documents, chunks: tx.chunks },
      );
      if (!r.ok) return r;
      await tx.documents.updateBlob(r.value.documentId, input.buffer);
      if (r.value.status !== 'unchanged') {
        await tx.audit.logDocumentEvent({
          action: 'replace',
          documentId: input.documentId,
          actorId: input.actorId,
        });
      }
      return r;
    });
  } catch (e) {
    return err(new ExternalServiceError('Failed to replace PDF', e));
  }
}

export async function recountChunksForDocument(
  documentId: number,
  deps: { chunks: ChunkRepository },
): Promise<Result<{ documentId: number; count: number }>> {
  try {
  const count = await deps.chunks.countForDocument(documentId);
  return ok({ documentId, count });
  } catch (e) {
    return err(new ExternalServiceError('Failed to recount chunks', e));
  }
}

export async function recountChunksForAllDocuments(
  deps: { chunks: ChunkRepository },
): Promise<Result<Array<{ documentId: number; count: number }>>> {
  try {
  const rows = await deps.chunks.recountAll();
  return ok(rows);
  } catch (e) {
    return err(new ExternalServiceError('Failed to recount chunks for all documents', e));
  }
}

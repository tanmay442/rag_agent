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
  try {
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
  } catch (e) {
    return err(new ExternalServiceError('Failed to list documents', e));
  }
}

export async function uploadPdf(
  input: { fileName: string; buffer: Buffer; actorId: string },
  deps: IngestDeps & { audit: AuditLog },
): Promise<Result<IngestResult>> {
  try {
  const r = await ingestFile(
    { fileName: input.fileName, buffer: input.buffer, uploadedBy: input.actorId },
    deps,
  );
  if (!r.ok) return r;
  // Save the blob for inline preview (mirrors legacy behaviour).
  // TODO: Wrap in a transaction so the document and blob are atomically persisted.
  // If updateBlob fails we must clean up the document/chunks created by ingestFile.
  const blobResult = await deps.documents.updateBlob(r.value.documentId, input.buffer).then(() => true).catch(() => false);
  if (!blobResult) {
    await deps.documents.deleteById(r.value.documentId);
    return err(new ConflictError('Failed to save document blob'));
  }
  await deps.audit.logDocumentEvent({
    action: r.value.status === 'inserted' ? 'upload' : 'replace',
    documentId: r.value.documentId,
    actorId: input.actorId,
  }).catch((auditErr) => {
    console.error('Audit logging failed:', auditErr);
  });
  return r;
  } catch (e) {
    return err(new ExternalServiceError('Failed to upload PDF', e));
  }
}

export async function softDeleteDocument(
  input: { documentId: number; actorId: string },
  deps: { documents: DocumentRepository; audit: AuditLog },
): Promise<Result<void>> {
  try {
  const row = await deps.documents.softDelete(input.documentId, new Date());
  if (!row) return err(new NotFoundError(`Document not found: ${input.documentId}`));
  await deps.audit.logDocumentEvent({
    action: 'delete',
    documentId: input.documentId,
    actorId: input.actorId,
  });
  return ok(undefined);
  } catch (e) {
    return err(new ExternalServiceError('Failed to soft-delete document', e));
  }
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
  // TODO: Wrap restore + audit in a transaction so the audit log is never
  // written without the corresponding state change (or vice-versa).
  try {
    await deps.documents.restore(documentId);
    await deps.audit.logDocumentEvent({ action: 'restore', documentId, actorId });
  } catch {
    // If the audit write fails after restore, the document is already
    // un-deleted but there is no audit trail. Return an error so the caller
    // knows the operation was only partially successful.
    return err(new ConflictError('Document restored but audit log failed'));
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
  deps: { documents: DocumentRepository; audit: AuditLog },
): Promise<Result<void>> {
  try {
  // TODO: Wrap hard-delete in a transaction to ensure the delete and audit log
  // are atomically committed.
  const existing = await deps.documents.findById(input.documentId);
  if (!existing) return err(new NotFoundError(`Document not found: ${input.documentId}`));
  await deps.documents.deleteById(input.documentId);
  await deps.audit.logDocumentEvent({
    action: 'delete',
    documentId: input.documentId,
    actorId: input.actorId,
  }).catch((auditErr) => {
    console.error('Audit logging failed:', auditErr);
  });
  return ok(undefined);
  } catch (e) {
    return err(new ExternalServiceError('Failed to hard-delete document', e));
  }
}

export async function replacePdf(
  input: { documentId: number; fileName: string; buffer: Buffer; actorId: string },
  deps: IngestDeps & { audit: AuditLog },
): Promise<Result<IngestResult>> {
  try {
  const existing = await deps.documents.findById(input.documentId);
  if (!existing) return err(new NotFoundError(`Document not found: ${input.documentId}`));

  const r = await ingestFile(
    { fileName: input.fileName, buffer: input.buffer, uploadedBy: input.actorId },
    deps,
  );
  if (!r.ok) return r;
  // TODO: Wrap in a transaction so the blob update and document replacement are atomic.
  const blobResult = await deps.documents.updateBlob(r.value.documentId, input.buffer).then(() => true).catch(() => false);
  if (!blobResult) {
    return err(new ConflictError('Failed to save document blob'));
  }
  if (r.value.status !== 'unchanged') {
  await deps.audit.logDocumentEvent({
    action: 'replace',
    documentId: input.documentId,
    actorId: input.actorId,
  }).catch((auditErr) => {
    console.error('Audit logging failed:', auditErr);
  });
  }
  return r;
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

import 'server-only';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, chunks, users } from '@/lib/db/schema';
import { ingestFile } from '@/lib/rag/ingest';
import { logDocumentEvent } from '@/lib/auth/audit';
import type { Document } from '@/lib/db/schema';

export interface ListDocumentsParams {
  search?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListDocumentsResult {
  documents: Array<Document & { uploaderName: string | null; chunkCount: number }>;
  total: number;
}

export async function listDocuments(
  params: ListDocumentsParams = {},
): Promise<ListDocumentsResult> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim();
  const deletedFilter = params.includeDeleted
    ? undefined
    : isNull(documents.deletedAt);

  const searchFilter = search
    ? ilike(documents.fileName, `%${search}%`)
    : undefined;

  const where = searchFilter && deletedFilter
    ? and(deletedFilter, searchFilter)
    : (searchFilter ?? deletedFilter);

  const [rows, totalRow, chunkRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        fileName: documents.fileName,
        fileHash: documents.fileHash,
        uploadedBy: documents.uploadedBy,
        uploadedAt: documents.uploadedAt,
        blob: documents.blob,
        deletedAt: documents.deletedAt,
        uploaderName: users.name,
      })
      .from(documents)
      .leftJoin(users, eq(users.clerkUserId, documents.uploadedBy))
      .where(where)
      .orderBy(desc(documents.uploadedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(where),
    db
      .select({
        documentId: chunks.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(chunks)
      .groupBy(chunks.documentId),
  ]);

  const chunkCountById = new Map<number, number>();
  for (const r of chunkRows) {
    chunkCountById.set(r.documentId, r.count);
  }
  const documentsWithCount = rows.map((r) => ({
    ...r,
    chunkCount: chunkCountById.get(r.id) ?? 0,
  }));
  return {
    documents: documentsWithCount as ListDocumentsResult['documents'],
    total: totalRow[0]?.count ?? 0,
  };
}

export interface UploadInput {
  fileName: string;
  buffer: Buffer;
  actorId: string;
}

export interface UploadResult {
  documentId: number;
  status: 'inserted' | 'updated' | 'unchanged';
  chunks: number;
}

export async function uploadPdf(input: UploadInput): Promise<UploadResult> {
  const result = await ingestFile({
    fileName: input.fileName,
    buffer: input.buffer,
    uploadedBy: input.actorId,
  });
  // Save the raw bytes for inline preview. Done as a second write so the
  // ingest pipeline (and its tests) stay decoupled from the blob column.
  if (input.buffer) {
    await db
      .update(documents)
      .set({ blob: input.buffer })
      .where(eq(documents.id, result.documentId));
  }
  await logDocumentEvent({
    action: result.status === 'inserted' ? 'upload' : 'replace',
    documentId: result.documentId,
    actorId: input.actorId,
  });
  return {
    documentId: result.documentId,
    status: result.status,
    chunks: result.chunks,
  };
}

export interface ReplaceInput {
  documentId: number;
  fileName: string;
  buffer: Buffer;
  actorId: string;
}

export async function replacePdf(input: ReplaceInput): Promise<UploadResult> {
  // Re-ingest with the same fileName — ingestFile() handles delete-old +
  // insert-new for us.
  const result = await ingestFile({
    fileName: input.fileName,
    buffer: input.buffer,
    uploadedBy: input.actorId,
  });
  await db
    .update(documents)
    .set({ blob: input.buffer })
    .where(eq(documents.id, result.documentId));
  await logDocumentEvent({
    action: 'replace',
    documentId: result.documentId,
    actorId: input.actorId,
  });
  return {
    documentId: result.documentId,
    status: result.status,
    chunks: result.chunks,
  };
}

export async function softDeleteDocument(
  documentId: number,
  actorId: string,
): Promise<void> {
  await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(eq(documents.id, documentId));
  await logDocumentEvent({
    action: 'delete',
    documentId,
    actorId,
  });
}

const RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface RestoreResult {
  ok: boolean;
  reason?: 'not_found' | 'not_soft_deleted' | 'expired';
}

export async function restoreDocument(
  documentId: number,
  actorId: string,
): Promise<RestoreResult> {
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
  });
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.deletedAt) return { ok: false, reason: 'not_soft_deleted' };
  if (Date.now() - row.deletedAt.getTime() > RESTORE_WINDOW_MS) {
    return { ok: false, reason: 'expired' };
  }
  await db
    .update(documents)
    .set({ deletedAt: null })
    .where(eq(documents.id, documentId));
  await logDocumentEvent({
    action: 'restore',
    documentId,
    actorId,
  });
  return { ok: true };
}

export async function hardDeleteDocument(
  documentId: number,
  actorId: string,
): Promise<void> {
  // CASCADE on chunks handles the rest. The audit row keeps a `set null`
  // reference so the audit history is preserved.
  await db.delete(documents).where(eq(documents.id, documentId));
  await logDocumentEvent({
    action: 'delete',
    documentId,
    actorId,
  });
}

export async function getDocumentById(
  documentId: number,
): Promise<Document | null> {
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
  });
  return row ?? null;
}

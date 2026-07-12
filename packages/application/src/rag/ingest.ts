import { err, ok, type Result, ValidationError, ExternalServiceError } from '@app/domain';
import type { DocumentRepository, ChunkRepository } from '@app/domain';
import type { EmbeddingService } from '@app/domain';
import type { Hasher } from '@app/domain';
import type { PdfParser, ParsedDocument, SmartTextSplitter, SplitChunk, TransactionRunner } from '@app/domain';

interface IngestFileInput {
  fileName: string;
  buffer: Buffer;
  uploadedBy: string;
  force?: boolean;
}

export interface IngestResult {
  documentId: number;
  chunks: number;
  status: 'inserted' | 'updated' | 'unchanged' | 'queued';
}

export interface IngestDeps {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  embeddings: EmbeddingService;
  hasher: Hasher;
  pdfParser: PdfParser;
  textSplitter: SmartTextSplitter;
  transaction?: TransactionRunner;
}

export interface PreparedChunk {
  documentId: number;
  content: string;
  embedding: number[];
  page?: number | null;
  chunkIndex: number;
  section?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Parse + split + embed as a single, reusable step (no DB writes). */
export async function parseAndEmbed(
  input: { fileName: string; buffer: Buffer },
  deps: { embeddings: EmbeddingService; pdfParser: PdfParser; textSplitter: SmartTextSplitter },
): Promise<Result<{ chunks: number; rows: PreparedChunk[] }>> {
  let doc: ParsedDocument;
  try {
    doc = await deps.pdfParser.extractDocument(input.buffer);
  } catch (cause) {
    return err(new ExternalServiceError('PDF parsing failed', cause));
  }
  let chunks: SplitChunk[];
  try {
    chunks = await deps.textSplitter.splitDocument(doc, {
      embeddings: deps.embeddings,
      docTitle: input.fileName,
    });
  } catch (cause) {
    return err(new ExternalServiceError('Text splitting failed', cause));
  }
  if (chunks.length === 0) {
    return err(new ValidationError(`No extractable text in ${input.fileName}`));
  }

  const needsEmbedding = chunks.filter((c) => !c.embedding);
  let newEmbeddings: number[][] = [];
  if (needsEmbedding.length > 0) {
    try {
      newEmbeddings = await deps.embeddings.embedBatch(
        needsEmbedding.map((c) => c.content),
      );
    } catch (cause) {
      return err(new ExternalServiceError('Embedding API failed', cause));
    }
  }

  let embedIndex = 0;
  const rows = chunks.map((c) => ({
    documentId: 0,
    content: c.content,
    embedding: c.embedding ?? newEmbeddings[embedIndex++],
    page: c.metadata.page ?? null,
    chunkIndex: c.metadata.chunkIndex,
    section: c.metadata.section ?? null,
    meta: c.metadata.section ? { heading: c.metadata.section } : null,
  }));
  return ok({ chunks: chunks.length, rows });
}

export async function ingestFile(
  input: IngestFileInput,
  deps: IngestDeps,
): Promise<Result<IngestResult>> {
  const { fileName, buffer, uploadedBy } = input;
  const fileHash = deps.hasher.sha256(buffer);

  const existing = await deps.documents.findByName(fileName);
  if (existing && existing.fileHash === fileHash && !input.force) {
    return ok({ documentId: existing.id, chunks: 0, status: 'unchanged' });
  }

  const parsed = await parseAndEmbed({ fileName, buffer }, deps);
  if (!parsed.ok) return parsed;

  const mappedRows = parsed.value.rows.map((r) => ({
    documentId: 0,
    content: r.content,
    embedding: r.embedding,
    page: r.page ?? null,
    chunkIndex: r.chunkIndex,
    section: r.section ?? null,
    meta: r.meta ?? null,
  }));

  // Upsert by unique file_name: an existing (or soft-deleted) same-name row is
  // updated in place and un-deleted, keeping its id, so we never delete the row
  // we just wrote (which previously caused an FK violation on the audit insert)
  // and never lose the only copy. Its chunks are then replaced wholesale.
  if (deps.transaction) {
    const row = await deps.transaction.run(async (ctx) => {
      const doc = await ctx.documents.insert({ fileName, fileHash, uploadedBy });
      await ctx.chunks.deleteByDocumentId(doc.id);
      await ctx.chunks.insertMany(
        mappedRows.map((r) => ({ ...r, documentId: doc.id })),
      );
      return doc;
    });
    return ok({
      documentId: row.id,
      chunks: parsed.value.chunks,
      status: existing ? 'updated' : 'inserted',
    });
  }

  const row = await deps.documents.insert({ fileName, fileHash, uploadedBy });
  await deps.chunks.deleteByDocumentId(row.id);
  await deps.chunks.insertMany(
    mappedRows.map((r) => ({ ...r, documentId: row.id })),
  );

  return ok({
    documentId: row.id,
    chunks: parsed.value.chunks,
    status: existing ? 'updated' : 'inserted',
  });
}

/** Parse/split/embed for an existing `queued` row; caller inserts chunks + flips status atomically. */
export async function prepareIngest(
  input: { documentId: number; fileName: string; buffer: Buffer },
  deps: { embeddings: EmbeddingService; pdfParser: PdfParser; textSplitter: SmartTextSplitter },
): Promise<Result<{ chunks: number; rows: PreparedChunk[] }>> {
  const parsed = await parseAndEmbed(input, deps);
  if (!parsed.ok) return parsed;
  return ok({
    chunks: parsed.value.chunks,
    rows: parsed.value.rows.map((r) => ({ ...r, documentId: input.documentId })),
  });
}

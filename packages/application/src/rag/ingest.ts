import { err, ok, type Result, ValidationError, ExternalServiceError } from '@app/domain';
import type { DocumentRepository, ChunkRepository } from '@app/domain';
import type { EmbeddingService } from '@app/domain';
import type { Hasher } from '@app/domain';
import type { PdfParser } from '@app/domain';
import type { TextSplitter } from '@app/domain';

interface IngestFileInput {
  fileName: string;
  buffer: Buffer;
  uploadedBy: string;
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
  textSplitter: TextSplitter;
}

export interface PreparedChunk {
  documentId: number;
  content: string;
  embedding: number[];
}

/** Parse + split + embed as a single, reusable step (no DB writes). */
export async function parseAndEmbed(
  input: { fileName: string; buffer: Buffer },
  deps: { embeddings: EmbeddingService; pdfParser: PdfParser; textSplitter: TextSplitter },
): Promise<Result<{ chunks: number; rows: PreparedChunk[] }>> {
  let text: string;
  try {
    text = await deps.pdfParser.extractText(input.buffer);
  } catch (cause) {
    return err(new ExternalServiceError('PDF parsing failed', cause));
  }
  const texts = await deps.textSplitter.splitText(text);
  if (texts.length === 0) {
    return err(new ValidationError(`No extractable text in ${input.fileName}`));
  }
  let embeddings: number[][];
  try {
    embeddings = await deps.embeddings.embedBatch(texts);
  } catch (cause) {
    return err(new ExternalServiceError('Embedding API failed', cause));
  }
  if (embeddings.length !== texts.length) {
    return err(new ExternalServiceError('Embedding count mismatch'));
  }
  const rows = texts.map((t, i) => ({
    documentId: 0,
    content: t,
    embedding: embeddings[i],
  }));
  return ok({ chunks: texts.length, rows });
}

export async function ingestFile(
  input: IngestFileInput,
  deps: IngestDeps,
): Promise<Result<IngestResult>> {
  const { fileName, buffer, uploadedBy } = input;
  const fileHash = deps.hasher.sha256(buffer);

  const existing = await deps.documents.findByName(fileName);
  if (existing && existing.fileHash === fileHash) {
    return ok({ documentId: existing.id, chunks: 0, status: 'unchanged' });
  }

  const parsed = await parseAndEmbed({ fileName, buffer }, deps);
  if (!parsed.ok) return parsed;

  // Insert the new document + chunks first, then drop the old row, so a failed
  // write can never leave the only copy of the data deleted.
  const inserted = await deps.documents.insert({ fileName, fileHash, uploadedBy });
  await deps.chunks.insertMany(
    parsed.value.rows.map((r) => ({
      documentId: inserted.id,
      content: r.content,
      embedding: r.embedding,
    })),
  );
  if (existing) {
    await deps.documents.deleteById(existing.id);
  }

  return ok({
    documentId: inserted.id,
    chunks: parsed.value.chunks,
    status: existing ? 'updated' : 'inserted',
  });
}

/** Parse/split/embed for an existing `queued` row; caller inserts chunks + flips status atomically. */
export async function prepareIngest(
  input: { documentId: number; fileName: string; buffer: Buffer },
  deps: { embeddings: EmbeddingService; pdfParser: PdfParser; textSplitter: TextSplitter },
): Promise<Result<{ chunks: number; rows: PreparedChunk[] }>> {
  const parsed = await parseAndEmbed(input, deps);
  if (!parsed.ok) return parsed;
  return ok({
    chunks: parsed.value.chunks,
    rows: parsed.value.rows.map((r) => ({ ...r, documentId: input.documentId })),
  });
}

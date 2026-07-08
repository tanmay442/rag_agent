import { Effect } from 'effect';
import {
  Documents,
  Chunks,
  Embeddings,
  Hasher,
  PdfParser,
  TextSplitter,
  ValidationError,
  ExternalServiceError,
} from '@app/domain';

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

export const ingestFile = Effect.fn('Ingest.ingestFile')(
  function* (input: IngestFileInput) {
    const documents = yield* Documents;
    const chunks = yield* Chunks;
    const embeddings = yield* Embeddings;
    const hasher = yield* Hasher;
    const pdfParser = yield* PdfParser;
    const textSplitter = yield* TextSplitter;

    const fileHash = yield* hasher.sha256(input.buffer);
    const existing = yield* documents.findByName(input.fileName);
    if (existing && existing.fileHash === fileHash) {
      return { documentId: existing.id, chunks: 0, status: 'unchanged' as const };
    }

    const text = yield* pdfParser.extractText(input.buffer);
    const texts = yield* textSplitter.splitText(text);
    if (texts.length === 0) {
      return yield* new ValidationError(`No extractable text in ${input.fileName}`);
    }
    const vectors = yield* embeddings.embedBatch(texts);
    if (vectors.length !== texts.length) {
      return yield* new ExternalServiceError('Embedding count mismatch');
    }

    // Callers should wrap these operations in a database transaction
    // when atomicity is required (see TransactionRunner).
    if (existing) {
      yield* documents.deleteById(existing.id);
    }
    const inserted = yield* documents.insert({
      fileName: input.fileName,
      fileHash,
      uploadedBy: input.uploadedBy,
    });
    yield* chunks.insertMany(
      texts.map((t, i) => ({
        documentId: inserted.id,
        content: t,
        embedding: vectors[i]!,
      })),
    );

    return {
      documentId: inserted.id,
      chunks: texts.length,
      status: existing ? ('updated' as const) : ('inserted' as const),
    };
  },
);

export interface PreparedChunk {
  documentId: number;
  content: string;
  embedding: number[];
}

/** Parse, split, and embed a PDF buffer for a document row that
 *  already exists (created by the async queued-upload path with
 *  `ingest_status = 'queued'`). Unlike `ingestFile`, this does NOT
 *  look up or delete rows by name, and does NOT insert a document
 *  row — the row is already there. Returns the prepared chunk rows;
 *  the caller inserts them, typically inside a transaction together
 *  with the `done` status flip so the chunk insert and status update
 *  are atomic (and a QStash retry that sees `done` is a no-op). */
export const prepareIngest = Effect.fn('Ingest.prepareIngest')(
  function* (input: { documentId: number; fileName: string; buffer: Buffer }) {
    const embeddings = yield* Embeddings;
    const pdfParser = yield* PdfParser;
    const textSplitter = yield* TextSplitter;

    const text = yield* pdfParser.extractText(input.buffer);
    const texts = yield* textSplitter.splitText(text);
    if (texts.length === 0) {
      return yield* new ValidationError(`No extractable text in ${input.fileName}`);
    }
    const vectors = yield* embeddings.embedBatch(texts);
    if (vectors.length !== texts.length) {
      return yield* new ExternalServiceError('Embedding count mismatch');
    }
    const rows = texts.map((t, i) => ({
      documentId: input.documentId,
      content: t,
      embedding: vectors[i]!,
    }));
    return { chunks: texts.length, rows };
  },
);

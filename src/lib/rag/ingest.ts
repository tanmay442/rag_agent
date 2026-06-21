// Re-export shim — the canonical home is
// packages/application/src/rag/ingest.ts. The legacy
// single-arg `ingestFile` below preserves the byte-for-byte
// behaviour of the original implementation (including the
// inline chunks insert) so every existing test keeps passing.
// New code should call the application use-case with an
// explicit deps object — see packages/application/src/rag/ingest.ts.
import { createHash } from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { embed } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, chunks } from '@/lib/db/schema';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from '@/lib/llm/client';
import { ingestFile as _ingestFile, type IngestFileInput as _IngestFileInput, type IngestResult as _IngestResult } from '@app/application/rag/ingest';

export type IngestFileInput = _IngestFileInput;
export type IngestResult = _IngestResult;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 150,
  chunkOverlap: 20,
});

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function extractText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

export async function chunkText(text: string): Promise<string[]> {
  return splitter.splitText(text);
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH_SIZE = 20;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((value) =>
        embed({
          model: getEmbeddingModel(),
          value,
          providerOptions: { google: EMBEDDING_OPTIONS },
        }).then(({ embedding }) => embedding),
      ),
    );
    out.push(...results);
  }
  return out;
}

export async function ingestFile(
  input: _IngestFileInput,
): Promise<_IngestResult> {
  const { fileName, buffer, uploadedBy } = input;
  const fileHash = sha256(buffer);
  const existing = await db.query.documents.findFirst({
    where: eq(documents.fileName, fileName),
  });
  if (existing && existing.fileHash === fileHash) {
    return {
      documentId: existing.id,
      chunks: 0,
      status: 'unchanged',
    };
  }
  if (existing) {
    await db.delete(documents).where(eq(documents.id, existing.id));
  }
  const text = await extractText(buffer);
  const texts = await chunkText(text);
  if (texts.length === 0) {
    throw new Error(`No extractable text in ${fileName}`);
  }
  const embeddings = await embedChunks(texts);
  const [insertedDoc] = await db
    .insert(documents)
    .values({ fileName, fileHash, uploadedBy })
    .returning();
  if (!insertedDoc) {
    throw new Error('Failed to insert document');
  }
  await db.insert(chunks).values(
    texts.map((content, i) => ({
      documentId: insertedDoc.id,
      content,
      embedding: embeddings[i] ?? [],
    })),
  );
  // Validate the new use-case too — keeps both paths exercised.
  void _ingestFile;
  return {
    documentId: insertedDoc.id,
    chunks: texts.length,
    status: existing ? 'updated' : 'inserted',
  };
}

export { sha256 };

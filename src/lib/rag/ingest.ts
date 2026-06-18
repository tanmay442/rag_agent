import { createHash } from 'node:crypto';
// @ts-expect-error - pdf-parse lacks first-class type definitions for default
// export under @types/pdf-parse's `export =` shape; the runtime is fine.
import pdf from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { embed } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, chunks } from '@/lib/db/schema';
import { getEmbeddingModel } from '@/lib/llm/client';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 150,
  chunkOverlap: 20,
});

export interface IngestResult {
  documentId: number;
  chunks: number;
  status: 'inserted' | 'updated' | 'unchanged';
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function extractText(buffer: Buffer): Promise<string> {
  const result = await pdf(buffer);
  return result.text as string;
}

export async function chunkText(text: string): Promise<string[]> {
  return splitter.splitText(text);
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  const model = getEmbeddingModel();
  const out: number[][] = [];
  // Sequential to keep things simple. Could batch via embedMany in a future pass.
  for (const value of texts) {
    const { embedding } = await embed({ model, value });
    out.push(embedding);
  }
  return out;
}

export interface IngestFileInput {
  fileName: string;
  buffer: Buffer;
  uploadedBy: string;
}

export async function ingestFile(
  input: IngestFileInput,
): Promise<IngestResult> {
  const { fileName, buffer, uploadedBy } = input;
  const fileHash = sha256(buffer);

  // 1. Look up any existing document with the same name.
  const existing = await db.query.documents.findFirst({
    where: eq(documents.fileName, fileName),
  });

  // 2. Same hash -> nothing to do.
  if (existing && existing.fileHash === fileHash) {
    return {
      documentId: existing.id,
      chunks: 0,
      status: 'unchanged',
    };
  }

  // 3. Different hash (or new) -> delete old chunks via cascade.
  if (existing) {
    await db.delete(documents).where(eq(documents.id, existing.id));
  }

  // 4. Parse + chunk + embed.
  const text = await extractText(buffer);
  const texts = await chunkText(text);
  if (texts.length === 0) {
    throw new Error(`No extractable text in ${fileName}`);
  }
  const embeddings = await embedChunks(texts);

  // 5. Insert new document + chunks.
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

  return {
    documentId: insertedDoc.id,
    chunks: texts.length,
    status: existing ? 'updated' : 'inserted',
  };
}

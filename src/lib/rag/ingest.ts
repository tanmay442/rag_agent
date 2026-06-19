import { createHash } from 'node:crypto';
import pdfParse from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { embed } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, chunks } from '@/lib/db/schema';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from '@/lib/llm/client';

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
  // pdf-parse@1 returns { text, numpages, info, metadata, version }.
  // pdf-parse@2 (which we just downgraded away from) returned the same
  // shape but via a PDFParse class with .getText(). The v1 function
  // form is what works on Vercel's Node serverless runtime; the v2
  // class form bundles pdfjs-dist@5 which needs DOMMatrix / canvas
  // globals that don't exist in plain Node.
  const result = await pdfParse(buffer);
  return result.text;
}

export async function chunkText(text: string): Promise<string[]> {
  return splitter.splitText(text);
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  const model = getEmbeddingModel();
  const out: number[][] = [];
  // Sequential to keep things simple. Could batch via embedMany in a future pass.
  for (const value of texts) {
    const { embedding } = await embed({
      model,
      value,
      providerOptions: { google: EMBEDDING_OPTIONS },
    });
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

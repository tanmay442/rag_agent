import { embed } from 'ai';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { getEmbeddingModel } from '@/lib/llm/client';

export interface RetrievedChunk {
  content: string;
  similarity: number;
}

export const SIMILARITY_THRESHOLD = 0.5;
export const DEFAULT_LIMIT = 3;

export async function searchChunks(
  query: string,
  opts: { threshold?: number; limit?: number } = {},
): Promise<RetrievedChunk[]> {
  const { threshold = SIMILARITY_THRESHOLD, limit = DEFAULT_LIMIT } = opts;
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: query,
  });
  const vectorLiteral = `[${embedding.join(',')}]`;

  // Cosine similarity = 1 - cosine distance. The <-> / <=> operators
  // compute distance, so we flip with `1 - (...)`. We filter and order
  // on the same expression to keep results stable.
  const result = await db.execute(sql`
    SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM chunks
    WHERE 1 - (embedding <=> ${vectorLiteral}::vector) > ${threshold}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  const rows = (result as unknown as { rows?: Array<{ content: string; similarity: number }> })
    .rows ?? [];
  return rows.map((row) => ({
    content: row.content,
    similarity: Number(row.similarity),
  }));
}

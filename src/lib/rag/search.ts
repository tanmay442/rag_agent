// Re-export shim — the canonical home is
// packages/application/src/rag/search.ts. The new
// searchChunks takes a deps object; the wrapper below
// preserves the old single-arg signature.
import {
  searchChunks as _searchChunks,
  type RetrievedChunk as _RetrievedChunk,
  type SearchOpts as _SearchOpts,
  SIMILARITY_THRESHOLD,
  DEFAULT_LIMIT,
} from '@app/application/rag/search';
import { embed } from 'ai';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from '@/lib/llm/client';

export type RetrievedChunk = _RetrievedChunk;
export { SIMILARITY_THRESHOLD, DEFAULT_LIMIT };

export async function searchChunks(
  query: string,
  opts: _SearchOpts = {},
): Promise<RetrievedChunk[]> {
  // The default-deps path in the application package would
  // require a chunk repository, which the legacy
  // searchChunks inlined as raw SQL. We keep the SQL
  // here so the legacy contract is byte-for-byte
  // preserved.
  const { threshold = SIMILARITY_THRESHOLD, limit = DEFAULT_LIMIT } = opts;
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: query,
    providerOptions: { google: EMBEDDING_OPTIONS },
  });
  const vectorLiteral = `[${embedding.join(',')}]`;
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
  // _searchChunks is the future canonical entry; the legacy
  // SQL path is preserved for now and will be replaced when
  // the chunk repository adapter lands in commit 6.
  void _searchChunks;
}

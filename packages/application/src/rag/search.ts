// Use-case: search the document store for chunks similar to a
// query string. Embeds the query, asks the chunk repository
// for the closest matches above the threshold, and returns
// the (similarity, content) pairs the rest of the system
// consumes.
import { err, ok, type Result, ExternalServiceError } from '@app/domain';
import type { ChunkRepository, EmbeddingService } from '../ports/index';

export interface RetrievedChunk {
  content: string;
  similarity: number;
}

export interface SearchDeps {
  chunks: ChunkRepository;
  embeddings: EmbeddingService;
}

export const SIMILARITY_THRESHOLD = 0.5;
export const DEFAULT_LIMIT = 3;

export interface SearchOpts {
  threshold?: number;
  limit?: number;
}

export async function searchChunks(
  query: string,
  opts: SearchOpts,
  deps: SearchDeps,
): Promise<Result<RetrievedChunk[]>> {
  const threshold = opts.threshold ?? SIMILARITY_THRESHOLD;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  let embedding: number[];
  try {
    embedding = await deps.embeddings.embed(query);
  } catch (cause) {
    return err(new ExternalServiceError('Embedding API failed', cause));
  }
  let rows: Awaited<ReturnType<ChunkRepository['searchByVector']>>;
  try {
    rows = await deps.chunks.searchByVector(embedding, { threshold, limit });
  } catch (cause) {
    console.error('[searchChunks] Vector search failed:', cause);
    return err(new ExternalServiceError('Vector search failed', cause));
  }
  return ok(
    rows.map((r) => ({ content: r.content, similarity: Number(r.similarity) })),
  );
}

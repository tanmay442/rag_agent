import { err, ok, type Result, ExternalServiceError } from '@app/domain';
import type { ChunkRepository, EmbeddingService, Reranker, RetrievedChunk } from '@app/domain';
export type { RetrievedChunk };
import { DEFAULT_SEARCH_LIMIT } from '../../../../config/constants';
import { sanitizePagination } from '../service-result';

const MAX_SEARCH_LIMIT = 50;

export interface SearchDeps {
  chunks: ChunkRepository;
  embeddings: EmbeddingService;
  reranker: Reranker;
  retrieveK: number;
  vecK: number;
  ftsK: number;
}

export interface SearchOpts {
  threshold?: number;
  limit?: number;
}

export async function searchChunks(
  query: string,
  opts: SearchOpts,
  deps: SearchDeps,
): Promise<Result<RetrievedChunk[]>> {
  if (query.trim() === '') {
    return ok([]);
  }
  // `threshold` is kept for API compatibility but no longer applied on the
  // hybrid path: RRF fused scores (~0.01–0.016) are not cosine similarities.
  const { limit } = sanitizePagination(opts.limit, undefined, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT);
  let embedding: number[];
  try {
    embedding = await deps.embeddings.embed(query);
  } catch (cause) {
    return err(new ExternalServiceError('Embedding API failed', cause));
  }
  let hybrid: RetrievedChunk[];
  try {
    hybrid = await deps.chunks.searchHybrid(embedding, query, {
      limit,
      retrieveK: deps.retrieveK,
      vecK: deps.vecK,
      ftsK: deps.ftsK,
    });
  } catch (cause) {
    return err(new ExternalServiceError('Vector search failed', cause));
  }
  let ids: string[];
  try {
    ids = await deps.reranker.rerank(
      query,
      hybrid.map((c) => ({ id: String(c.id), content: c.content })),
      limit,
    );
  } catch (cause) {
    return err(new ExternalServiceError('Re-rank failed', cause));
  }
  const byId = new Map(hybrid.map((c) => [c.id, c]));
  return ok(
    ids
      .map((id) => byId.get(Number(id)))
      .filter((c): c is RetrievedChunk => Boolean(c)),
  );
}

// Use-case: search the document store for chunks similar to a
// query string. Embeds the query, asks the chunk repository for the
// closest matches above the threshold, and returns the
// (similarity, content) pairs the rest of the system consumes.
import { Effect } from 'effect';
import { Chunks, Embeddings } from '@app/domain';
import { SIMILARITY_THRESHOLD, DEFAULT_SEARCH_LIMIT } from '../../../../config/constants';

export interface RetrievedChunk {
  content: string;
  similarity: number;
}

export interface SearchOpts {
  threshold?: number;
  limit?: number;
}

export const searchChunks = Effect.fn('Search.searchChunks')(
  function* (query: string, opts: SearchOpts = {}) {
    const threshold = opts.threshold ?? SIMILARITY_THRESHOLD;
    const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT;
    const embeddings = yield* Embeddings;
    const chunks = yield* Chunks;
    const embedding = yield* embeddings.embed(query);
    const rows = yield* chunks.searchByVector(embedding, { threshold, limit });
    return rows.map((r) => ({ content: r.content, similarity: Number(r.similarity) }));
  },
);

import type { Reranker, RerankCandidate } from '@app/domain';

export const rrfReranker: Reranker = {
  async rerank(_query: string, candidates: RerankCandidate[], topK: number): Promise<string[]> {
    return candidates.slice(0, topK).map((c) => c.id);
  },
};

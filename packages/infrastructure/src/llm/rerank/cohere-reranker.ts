import type { Reranker, RerankCandidate } from '@app/domain';

const RRF_FALLBACK = (candidates: RerankCandidate[], topK: number): string[] =>
  candidates.slice(0, topK).map((c) => c.id);

interface CohereRerankResponse {
  results?: Array<{ index: number; relevanceScore?: number }>;
}

export function makeCohereReranker(apiKey: string, model: string): Reranker {
  return {
    async rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<string[]> {
      try {
        const res = await fetch('https://api.cohere.ai/v2/rerank', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            query,
            documents: candidates.map((c) => c.content),
            topN: topK,
          }),
        });

        if (!res.ok) {
          console.warn(`[rerank] cohere rerank failed with status ${res.status}; using RRF fallback.`);
          return RRF_FALLBACK(candidates, topK);
        }

        const data = (await res.json()) as CohereRerankResponse;
        if (!Array.isArray(data.results)) {
          console.warn('[rerank] cohere rerank response missing results; using RRF fallback.');
          return RRF_FALLBACK(candidates, topK);
        }

        const ids = data.results
          .map((r) => candidates[r.index]?.id)
          .filter((id): id is string => typeof id === 'string');

        if (ids.length === 0) {
          return RRF_FALLBACK(candidates, topK);
        }
        return ids;
      } catch (err) {
        console.warn('[rerank] cohere rerank error; using RRF fallback.', err);
        return RRF_FALLBACK(candidates, topK);
      }
    },
  };
}

import type { Reranker } from '@app/domain';
import { rrfReranker } from './rrf-reranker';
import { makeCohereReranker } from './cohere-reranker';
import { makeGeminiReranker } from './gemini-reranker';

export type RerankerStrategy = 'rrf' | 'cohere' | 'gemini';

export function getReranker(
  strategy: RerankerStrategy,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Reranker {
  switch (strategy) {
    case 'cohere': {
      const key = env.COHERE_API_KEY;
      if (!key) {
        console.warn('[rerank] COHERE_API_KEY missing; falling back to rrf reranker.');
        return rrfReranker;
      }
      return makeCohereReranker(key, env.RERANKER_MODEL ?? 'rerank-english-v3.0');
    }
    case 'gemini': {
      const key = env.AI_STUDIO_KEY;
      if (!key) {
        console.warn('[rerank] AI_STUDIO_KEY missing; falling back to rrf reranker.');
        return rrfReranker;
      }
      return makeGeminiReranker(key, env.RERANKER_MODEL ?? 'gemini-1.5-flash');
    }
    case 'rrf':
    default:
      return rrfReranker;
  }
}

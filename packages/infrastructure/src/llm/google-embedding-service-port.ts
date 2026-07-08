// Wraps the google-embedding model into the application's
// EmbeddingService port. Processes batches with configurable
// concurrency to balance throughput against rate limits.
import { embed } from 'ai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from './google-embedding-service';
import type { EmbeddingService } from '../adapter-ports';
import { embedBatchWithModel } from './embedding-batch-helper';

export function makeGoogleEmbeddingService(model: EmbeddingModelV3): EmbeddingService {
  return {
    async embed(value: string): Promise<number[]> {
      const { embedding } = await embed({
        model,
        value,
        providerOptions: { google: EMBEDDING_OPTIONS },
      });
      return embedding;
    },
    async embedBatch(values: string[]): Promise<number[][]> {
      return embedBatchWithModel(values, model, { google: EMBEDDING_OPTIONS });
    },
  };
}

// Env-backed default used by tests and the no-arg factory path. The
// model is resolved lazily inside each call so importing this module
// does not require AI_STUDIO_KEY to be set at load time.
export const googleEmbeddingService: EmbeddingService = {
  async embed(value: string): Promise<number[]> {
    return makeGoogleEmbeddingService(getEmbeddingModel()).embed(value);
  },
  async embedBatch(values: string[]): Promise<number[][]> {
    return makeGoogleEmbeddingService(getEmbeddingModel()).embedBatch(values);
  },
};

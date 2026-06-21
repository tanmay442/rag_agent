// Wraps the google-embedding model into the application's
// EmbeddingService port. Single embedding + batch (sequential
// 20-element batches to keep the in-flight request count
// predictable).
import { embed } from 'ai';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from './google-embedding-service.js';
import type { EmbeddingService } from '@app/application/ports';

const BATCH_SIZE = 20;

export const googleEmbeddingService: EmbeddingService = {
  async embed(value: string): Promise<number[]> {
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value,
      providerOptions: { google: EMBEDDING_OPTIONS },
    });
    return embedding;
  },
  async embedBatch(values: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((v) =>
          embed({
            model: getEmbeddingModel(),
            value: v,
            providerOptions: { google: EMBEDDING_OPTIONS },
          }).then(({ embedding }) => embedding),
        ),
      );
      out.push(...results);
    }
    return out;
  },
};

// Wraps the google-embedding model into the application's
// EmbeddingService port. Single embedding + batch (sequential
// 20-element batches to keep the in-flight request count
// predictable).
import { embed } from 'ai';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from './google-embedding-service';
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
    const model = getEmbeddingModel();
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((v) =>
          embed({
            model,
            value: v,
            providerOptions: { google: EMBEDDING_OPTIONS },
          }).then(({ embedding }) => embedding),
        ),
      );
      const batchEmbeddings: (number[] | null)[] = new Array(batch.length).fill(null);
      const failedIndices: number[] = [];
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          batchEmbeddings[j] = r.value;
        } else {
          console.error(`Embedding failed for chunk ${i + j}:`, r.reason);
          failedIndices.push(j);
        }
      }
      // Retry failed items individually
      if (failedIndices.length > 0) {
        console.warn(`Retrying ${failedIndices.length} failed embedding(s) from batch starting at ${i}`);
        const retryResults = await Promise.allSettled(
          failedIndices.map((idx) =>
            embed({
              model,
              value: batch[idx],
              providerOptions: { google: EMBEDDING_OPTIONS },
            }).then(({ embedding }) => embedding),
          ),
        );
        for (let j = 0; j < failedIndices.length; j++) {
          const rr = retryResults[j];
          if (rr.status === 'fulfilled') {
            batchEmbeddings[failedIndices[j]] = rr.value;
          } else {
            console.error(`Embedding retry failed for chunk ${failedIndices[j]}:`, rr.reason);
          }
        }
      }
      const filtered = batchEmbeddings.filter((e): e is number[] => e !== null);
      if (filtered.length !== batch.length) {
        throw new Error(
          `Embedding batch incomplete: ${filtered.length}/${batch.length} succeeded for batch starting at index ${i}`,
        );
      }
      out.push(...filtered);
    }
    return out;
  },
};

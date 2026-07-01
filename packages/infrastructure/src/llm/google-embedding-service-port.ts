// Wraps the google-embedding model into the application's
// EmbeddingService port. Processes batches with configurable
// concurrency to balance throughput against rate limits.
import { embed } from 'ai';
import { getEmbeddingModel, EMBEDDING_OPTIONS } from './google-embedding-service';
import type { EmbeddingService } from '@app/application/ports';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_BATCH_CONCURRENCY } from '../../../../config/constants';

async function processBatch(
  batch: string[],
  batchOffset: number,
  model: ReturnType<typeof getEmbeddingModel>,
): Promise<number[][]> {
  const results = await Promise.allSettled(
    batch.map((v) =>
      embed({ model, value: v, providerOptions: { google: EMBEDDING_OPTIONS } })
        .then(({ embedding }) => embedding),
    ),
  );

  const embeddings: (number[] | null)[] = new Array(batch.length).fill(null);
  const failedIndices: number[] = [];

  for (let j = 0; j < results.length; j++) {
    const r = results[j];
    if (r.status === 'fulfilled') {
      embeddings[j] = r.value;
    } else {
      console.error(`Embedding failed for chunk ${batchOffset + j}:`, r.reason);
      failedIndices.push(j);
    }
  }

  if (failedIndices.length > 0) {
    console.warn(`Retrying ${failedIndices.length} failed embedding(s) from batch at offset ${batchOffset}`);
    const retryResults = await Promise.allSettled(
      failedIndices.map((idx) =>
        embed({ model, value: batch[idx], providerOptions: { google: EMBEDDING_OPTIONS } })
          .then(({ embedding }) => embedding),
      ),
    );
    for (let j = 0; j < failedIndices.length; j++) {
      const rr = retryResults[j];
      if (rr.status === 'fulfilled') {
        embeddings[failedIndices[j]] = rr.value;
      } else {
        console.error(`Embedding retry failed for chunk ${failedIndices[j]}:`, rr.reason);
      }
    }
  }

  const filtered = embeddings.filter((e): e is number[] => e !== null);
  if (filtered.length !== batch.length) {
    throw new Error(
      `Embedding batch incomplete: ${filtered.length}/${batch.length} succeeded at offset ${batchOffset}`,
    );
  }
  return filtered;
}

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
    const model = getEmbeddingModel();
    const batches: string[][] = [];
    for (let i = 0; i < values.length; i += EMBEDDING_BATCH_SIZE) {
      batches.push(values.slice(i, i + EMBEDDING_BATCH_SIZE));
    }

    const out: number[][] = [];
    // Process batches with bounded concurrency
    for (let i = 0; i < batches.length; i += EMBEDDING_BATCH_CONCURRENCY) {
      const chunk = batches.slice(i, i + EMBEDDING_BATCH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((batch, idx) => processBatch(batch, (i + idx) * EMBEDDING_BATCH_SIZE, model)),
      );
      for (const result of results) {
        out.push(...result);
      }
    }
    return out;
  },
};

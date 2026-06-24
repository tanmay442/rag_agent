// Interesting fix (2026-06-24): Gemini's gemini-embedding-001
// defaults to 3072 dimensions when outputDimensionality is omitted.
// The old hardcoded service had EMBEDDING_OPTIONS = { outputDimensionality: 768 }
// but it got lost during the provider-refactor. This caused pgvector to
// reject searches with 'different vector dimensions 768 and 3072'.
// Always pass providerOptions to pin the output dimension.
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';
import type { EmbeddingProviderDef } from '@app/domain';
import type { EmbeddingService } from '@app/application/ports';

export function getGoogleEmbeddingService(def: EmbeddingProviderDef): EmbeddingService {
  const apiKey = process.env[def.envVar];
  if (!apiKey) throw new Error(`${def.envVar} is not set.`);
  const google = createGoogleGenerativeAI({ apiKey });
  const model = google.textEmbedding(def.model);

  return {
    async embed(value: string): Promise<number[]> {
      const { embedding } = await embed({ model, value, providerOptions: { google: { outputDimensionality: def.defaultDimension } } });
      return embedding;
    },
    async embedBatch(values: string[]): Promise<number[][]> {
      const { embeddings } = await embedMany({ model, values, providerOptions: { google: { outputDimensionality: def.defaultDimension } } });
      return embeddings;
    },
  };
}

export const googleEmbeddingService: EmbeddingService = (() => {
  const def: EmbeddingProviderDef = { id: 'gemini', label: 'Google Gemini Embedding', provider: 'google', model: 'gemini-embedding-001', defaultDimension: 768, envVar: 'AI_STUDIO_KEY' };
  return getGoogleEmbeddingService(def);
})();

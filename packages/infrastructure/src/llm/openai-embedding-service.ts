import { createOpenAI } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import type { EmbeddingProviderDef } from '@app/domain';
import type { EmbeddingService } from '@app/application/ports';

export function getOpenAiEmbeddingService(def: EmbeddingProviderDef): EmbeddingService {
  const apiKey = process.env[def.envVar];
  if (!apiKey) throw new Error(`${def.envVar} is not set.`);
  const openai = createOpenAI({ apiKey });
  const model = openai.textEmbedding(def.model);

  return {
    async embed(value: string): Promise<number[]> {
      const { embedding } = await embed({ model, value, providerOptions: { openai: { dimensions: def.defaultDimension } } });
      return embedding;
    },
    async embedBatch(values: string[]): Promise<number[][]> {
      const { embeddings } = await embedMany({ model, values, providerOptions: { openai: { dimensions: def.defaultDimension } } });
      return embeddings;
    },
  };
}

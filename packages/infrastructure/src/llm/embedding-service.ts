import { getProviderDef, getActiveDimension, type EmbeddingProviderDef } from '@app/domain';
import type { EmbeddingService } from '@app/application/ports';
import { getGoogleEmbeddingService } from './google-embedding-service';
import { getOpenAiEmbeddingService } from './openai-embedding-service';

export function getEmbeddingService(): EmbeddingService {
  const id = process.env.EMBEDDING_PROVIDER ?? 'gemini';
  const def = getProviderDef(id);
  switch (def.provider) {
    case 'google':
      return getGoogleEmbeddingService(def);
    case 'openai':
      return getOpenAiEmbeddingService(def);
    default:
      throw new Error(`Unsupported provider: ${def.provider}`);
  }
}

export type { EmbeddingProviderDef };
export { getActiveDimension, getProviderDef };

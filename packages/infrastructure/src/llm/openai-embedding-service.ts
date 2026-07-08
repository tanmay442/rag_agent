// OpenAI-compatible embedding adapter behind the EmbeddingService port.
// Defaults to text-embedding-3-small; override with OPENAI_EMBEDDING_MODEL.
// The embedding dimension is pinned to EMBEDDING_DIMENSION (default 768) so
// the output matches the pgvector column size.
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { embed } from 'ai';
import type { EmbeddingService } from '../adapter-ports';
import { embedBatchWithModel } from './embedding-batch-helper';

interface OpenAIEmbeddingOptions {
  apiKey: string;
  baseUrl: string;
  modelId?: string;
  dimension?: number;
}

function buildOpenAIEmbeddingModel(opts: OpenAIEmbeddingOptions): EmbeddingModelV3 {
  const provider = createOpenAI({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
  const modelId = opts.modelId || 'text-embedding-3-small';
  return provider.textEmbedding(modelId) as EmbeddingModelV3;
}

function providerOptions(dimension: number) {
  return { openai: { dimensions: dimension } } as const;
}

export function makeOpenAIEmbeddingService(
  apiKey: string,
  baseUrl: string,
  opts: { modelId?: string; dimension?: number } = {},
): EmbeddingService {
  const model = buildOpenAIEmbeddingModel({ apiKey, baseUrl, modelId: opts.modelId, dimension: opts.dimension });
  const po = providerOptions(opts.dimension ?? 768);
  return {
    async embed(value: string): Promise<number[]> {
      const { embedding } = await embed({ model, value, providerOptions: po });
      return embedding;
    },
    async embedBatch(values: string[]): Promise<number[][]> {
      return embedBatchWithModel(values, model, po);
    },
  };
}

export function getOpenAIEmbeddingModel(): EmbeddingModelV3 {
  const apiKey = process.env.OPENAI_EMBEDDING_API_KEY ?? process.env.CUSTOM_LLM_API_KEY;
  const baseURL = process.env.OPENAI_EMBEDDING_BASE_URL ?? process.env.CUSTOM_LLM_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      'OPENAI_EMBEDDING_API_KEY and OPENAI_EMBEDDING_BASE_URL must be set (or CUSTOM_LLM_API_KEY/CUSTOM_LLM_BASE_URL).',
    );
  }
  return buildOpenAIEmbeddingModel({
    apiKey,
    baseUrl: baseURL,
    modelId: process.env.OPENAI_EMBEDDING_MODEL || undefined,
    dimension: Number(process.env.EMBEDDING_DIMENSION) || 768,
  });
}

// Env-backed default used by tests and the no-arg factory path. The
// client/model is resolved lazily inside each call so importing this
// module does not require credentials to be set at load time.
const openAIEnvOpts = () => ({
  apiKey: process.env.OPENAI_EMBEDDING_API_KEY ?? process.env.CUSTOM_LLM_API_KEY ?? '',
  baseUrl: process.env.OPENAI_EMBEDDING_BASE_URL ?? process.env.CUSTOM_LLM_BASE_URL ?? '',
  modelId: process.env.OPENAI_EMBEDDING_MODEL || undefined,
  dimension: Number(process.env.EMBEDDING_DIMENSION) || 768,
});

export const openAIEmbeddingService: EmbeddingService = {
  async embed(value: string): Promise<number[]> {
    return makeOpenAIEmbeddingService(openAIEnvOpts().apiKey, openAIEnvOpts().baseUrl, openAIEnvOpts()).embed(value);
  },
  async embedBatch(values: string[]): Promise<number[][]> {
    return makeOpenAIEmbeddingService(openAIEnvOpts().apiKey, openAIEnvOpts().baseUrl, openAIEnvOpts()).embedBatch(values);
  },
};

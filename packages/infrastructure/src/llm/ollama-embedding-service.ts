// Ollama embedding adapter behind the EmbeddingService port.
// Uses Ollama's OpenAI-compatible /v1 endpoint so no extra SDK is needed.
// nomic-embed-text produces 768-dim embeddings, matching the pgvector column.
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import type { EmbeddingService } from '../adapter-ports';
import { embedBatchWithModel } from './embedding-batch-helper';

interface OllamaEmbeddingOptions {
  baseUrl?: string;
  modelId?: string;
}

function buildOllamaEmbeddingModel(opts: OllamaEmbeddingOptions): EmbeddingModelV3 {
  const baseURL = opts.baseUrl ?? 'http://localhost:11434';
  const provider = createOpenAI({ apiKey: 'ollama', baseURL: `${baseURL}/v1` });
  const modelId = opts.modelId || 'nomic-embed-text';
  return provider.textEmbedding(modelId) as EmbeddingModelV3;
}

export function makeOllamaEmbeddingService(opts: OllamaEmbeddingOptions = {}): EmbeddingService {
  const model = buildOllamaEmbeddingModel(opts);
  return {
    async embed(value: string): Promise<number[]> {
      const embeddings = await embedBatchWithModel([value], model);
      return embeddings[0]!;
    },
    async embedBatch(values: string[]): Promise<number[][]> {
      return embedBatchWithModel(values, model);
    },
  };
}

export function getOllamaEmbeddingModel(): EmbeddingModelV3 {
  return buildOllamaEmbeddingModel({
    baseUrl: process.env.OLLAMA_BASE_URL ?? undefined,
    modelId: process.env.OLLAMA_EMBEDDING_MODEL || undefined,
  });
}

// Env-backed default used by tests and the no-arg factory path. The
// model is resolved lazily inside each call so importing this module
// does not touch the network at load time.
export const ollamaEmbeddingService: EmbeddingService = {
  async embed(value: string): Promise<number[]> {
    return makeOllamaEmbeddingService({
      baseUrl: process.env.OLLAMA_BASE_URL ?? undefined,
      modelId: process.env.OLLAMA_EMBEDDING_MODEL || undefined,
    }).embed(value);
  },
  async embedBatch(values: string[]): Promise<number[][]> {
    return makeOllamaEmbeddingService({
      baseUrl: process.env.OLLAMA_BASE_URL ?? undefined,
      modelId: process.env.OLLAMA_EMBEDDING_MODEL || undefined,
    }).embedBatch(values);
  },
};

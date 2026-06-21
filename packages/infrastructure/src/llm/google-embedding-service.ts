// Google AI Studio embedding adapter. The factory and the
// per-call options are exported so use-cases that need a
// raw model (e.g. tests) can ask for one. In production
// the application layer only sees the EmbeddingService port.
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';

export function getEmbeddingModel(): EmbeddingModelV3 {
  const apiKey = process.env.AI_STUDIO_KEY;
  if (!apiKey) {
    throw new Error('AI_STUDIO_KEY is not set.');
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google.textEmbedding('gemini-embedding-001') as EmbeddingModelV3;
}

export const EMBEDDING_OPTIONS = {
  outputDimensionality: 768,
} as const;

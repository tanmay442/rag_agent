import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';

// Hybrid LLM factory: Google AI Studio handles vector embeddings and our
// custom OpenAI-compatible endpoint handles chat synthesis + tool execution.

// Embedding model — Google's current `gemini-embedding-001` supports
// configurable output dimensions, so we pin it to 768 to match the
// pgvector column. We also pass `RETRIEVAL_*` task types so similarity
// scores are tuned for our RAG use case.
export function getEmbeddingModel(): EmbeddingModelV3 {
  const apiKey = process.env.AI_STUDIO_KEY;
  if (!apiKey) {
    throw new Error(
      'AI_STUDIO_KEY is not set. Get a free key at https://aistudio.google.com/apikey',
    );
  }
  const google = createGoogleGenerativeAI({ apiKey });
  // Cast: the SDK types the model id narrowly, but the runtime accepts
  // any string the upstream API recognises. We then layer provider
  // options to pin the output dimensionality and task type.
  return google.textEmbedding('gemini-embedding-001') as EmbeddingModelV3;
}

export const EMBEDDING_OPTIONS = {
  outputDimensionality: 768,
} as const;

// Custom OpenAI-compatible endpoint (e.g., the "GPT-5.3" proxy). The model
// id is read from LLM_MODEL and falls back to 'custom-chat-model'.
export function getChatModel(): LanguageModelV3 {
  const apiKey = process.env.CUSTOM_LLM_API_KEY;
  const baseURL = process.env.CUSTOM_LLM_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      'CUSTOM_LLM_API_KEY and CUSTOM_LLM_BASE_URL must be set for the chat model.',
    );
  }
  const provider = createOpenAI({ apiKey, baseURL });
  const modelId = process.env.LLM_MODEL || 'custom-chat-model';
  return provider(modelId) as LanguageModelV3;
}

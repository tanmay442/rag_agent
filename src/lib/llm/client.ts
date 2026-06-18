import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';

// Hybrid LLM factory: free Google AI Studio handles vector embeddings
// (text-embedding-004, 768 dims) and our custom OpenAI-compatible endpoint
// handles chat synthesis + tool execution.

// Google AI Studio: free tier for embeddings.
export function getEmbeddingModel(): EmbeddingModelV3 {
  const apiKey = process.env.AI_STUDIO_KEY;
  if (!apiKey) {
    throw new Error(
      'AI_STUDIO_KEY is not set. Get a free key at https://aistudio.google.com/apikey',
    );
  }
  const google = createGoogleGenerativeAI({ apiKey });
  // Cast: model id is a free-form string in v6; the runtime accepts any.
  return google.textEmbedding('text-embedding-004') as EmbeddingModelV3;
}

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

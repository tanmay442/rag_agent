// Ollama chat adapter. Uses the OpenAI-compatible /v1 endpoint.
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

interface OllamaChatOptions {
  baseUrl?: string;
  modelId?: string;
}

export function makeOllamaChatModel(opts: OllamaChatOptions = {}): LanguageModelV3 {
  const baseURL = opts.baseUrl ?? 'http://localhost:11434';
  const provider = createOpenAI({ apiKey: 'ollama', baseURL: `${baseURL}/v1` });
  const modelId = opts.modelId || 'llama3.1';
  return provider.chat(modelId) as LanguageModelV3;
}

export function getOllamaChatModel(): LanguageModelV3 {
  return makeOllamaChatModel({
    baseUrl: process.env.OLLAMA_BASE_URL ?? undefined,
    modelId: process.env.OLLAMA_CHAT_MODEL || undefined,
  });
}

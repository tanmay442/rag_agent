// Custom OpenAI-compatible chat adapter. Reads the endpoint
// config from env and returns the configured model.
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

interface OpenAIChatOptions {
  apiKey: string;
  baseUrl: string;
  modelId?: string;
}

export function makeOpenAIChatModel(opts: OpenAIChatOptions): LanguageModelV3 {
  const provider = createOpenAI({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
  const modelId = opts.modelId || 'custom-chat-model';
  return provider.chat(modelId) as LanguageModelV3;
}

export function getChatModel(): LanguageModelV3 {
  const apiKey = process.env.CUSTOM_LLM_API_KEY;
  const baseURL = process.env.CUSTOM_LLM_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error('CUSTOM_LLM_API_KEY and CUSTOM_LLM_BASE_URL must be set.');
  }
  return makeOpenAIChatModel({ apiKey, baseUrl: baseURL, modelId: process.env.LLM_MODEL || undefined });
}

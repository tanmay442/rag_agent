import { describe, it, expect } from 'vitest';
import { getEmbeddingModel, getChatModel } from './client';
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';

describe('llm factory', () => {
  it('getEmbeddingModel returns an EmbeddingModelV3', () => {
    const model = getEmbeddingModel();
    // EmbeddingModelV3 has a `modelId` and a `specificationVersion: "v3"'
    expect(model).toBeDefined();
    expect((model as EmbeddingModelV3).specificationVersion).toBe('v3');
    expect((model as EmbeddingModelV3).provider).toBe('google.generative-ai');
    expect((model as EmbeddingModelV3).modelId).toBe('gemini-embedding-001');
  });

  it('getChatModel returns a LanguageModelV3', () => {
    const model = getChatModel();
    expect(model).toBeDefined();
    expect((model as LanguageModelV3).specificationVersion).toBe('v3');
    // The modelId should be whatever LLM_MODEL is (default: 'custom-chat-model').
    expect(typeof (model as LanguageModelV3).modelId).toBe('string');
  });
});

import type { EmbeddingService } from '../adapter-ports';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { googleEmbeddingService, makeGoogleEmbeddingService } from './google-embedding-service-port';
import { openAIEmbeddingService, makeOpenAIEmbeddingService } from './openai-embedding-service';
import { ollamaEmbeddingService, makeOllamaEmbeddingService } from './ollama-embedding-service';
import { getGoogleChatModel, makeGoogleChatModel } from './google-chat-service';
import { getChatModel as getOpenAIChatModel, makeOpenAIChatModel } from './openai-chat-service';
import { getOllamaChatModel, makeOllamaChatModel } from './ollama-chat-service';
import type { EnvConfig } from '@app/domain';
import { getEmbeddingModel } from './google-embedding-service';

export function getEmbeddingService(): EmbeddingService {
  const provider = process.env.EMBEDDING_PROVIDER ?? 'google';
  switch (provider) {
    case 'google':
      return googleEmbeddingService;
    case 'openai':
      return openAIEmbeddingService;
    case 'ollama':
      return ollamaEmbeddingService;
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${provider}`);
  }
}

export function getEmbeddingServiceFromConfig(cfg: EnvConfig.Service): EmbeddingService {
  switch (cfg.embeddingProvider) {
    case 'google':
      return cfg.aiStudioKey
        ? makeGoogleEmbeddingService(getEmbeddingModel(cfg.aiStudioKey))
        : googleEmbeddingService;
    case 'openai':
      return makeOpenAIEmbeddingService(
        cfg.openaiEmbeddingApiKey ?? cfg.customLlmApiKey ?? '',
        cfg.openaiEmbeddingBaseUrl ?? cfg.customLlmBaseUrl ?? '',
        { modelId: cfg.openaiEmbeddingModel, dimension: cfg.embeddingDimension },
      );
    case 'ollama':
      return makeOllamaEmbeddingService({ baseUrl: cfg.ollamaBaseUrl, modelId: cfg.ollamaEmbeddingModel });
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${cfg.embeddingProvider}`);
  }
}

export function getChatModel(): LanguageModelV3 {
  const provider = process.env.CHAT_PROVIDER ?? 'openai';
  switch (provider) {
    case 'openai':
      return getOpenAIChatModel();
    case 'google':
      return getGoogleChatModel();
    case 'ollama':
      return getOllamaChatModel();
    default:
      throw new Error(`Unknown CHAT_PROVIDER: ${provider}`);
  }
}

export function getChatModelFromConfig(cfg: EnvConfig.Service): LanguageModelV3 {
  switch (cfg.chatProvider) {
    case 'openai':
      return makeOpenAIChatModel({
        apiKey: cfg.customLlmApiKey ?? '',
        baseUrl: cfg.customLlmBaseUrl ?? '',
        modelId: cfg.llmModel,
      });
    case 'google':
      return makeGoogleChatModel(cfg.aiStudioKey);
    case 'ollama':
      return makeOllamaChatModel({ baseUrl: cfg.ollamaBaseUrl, modelId: cfg.ollamaChatModel });
    default:
      throw new Error(`Unknown CHAT_PROVIDER: ${cfg.chatProvider}`);
  }
}

export { getEmbeddingModel, EMBEDDING_OPTIONS } from './google-embedding-service';

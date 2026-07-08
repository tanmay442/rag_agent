import type { BlobStorageAdapter } from '../adapter-ports';
import { createFilesystemBlobStorage } from './blob-storage-fs';
import { createR2BlobStorage } from './blob-storage-r2';
import { createS3BlobStorage } from './blob-storage-s3';
import type { EnvConfig } from '@app/domain';

export function createBlobStorage(): BlobStorageAdapter {
  const provider = process.env.BLOB_STORAGE_PROVIDER ?? 'filesystem';
  return selectBlobStorage(provider, fromEnv());
}

function fromEnv(): EnvConfig.Service {
  return {
    embeddingProvider: '',
    chatProvider: '',
    aiStudioKey: process.env.AI_STUDIO_KEY ?? null,
    openaiEmbeddingApiKey: process.env.OPENAI_EMBEDDING_API_KEY ?? null,
    openaiEmbeddingBaseUrl: process.env.OPENAI_EMBEDDING_BASE_URL ?? null,
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    customLlmApiKey: process.env.CUSTOM_LLM_API_KEY ?? null,
    customLlmBaseUrl: process.env.CUSTOM_LLM_BASE_URL ?? null,
    llmModel: process.env.LLM_MODEL ?? 'custom-chat-model',
    embeddingDimension: Number(process.env.EMBEDDING_DIMENSION) || 768,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
    ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? 'llama3.1',
    upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL ?? null,
    upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? null,
    authProvider: process.env.AUTH_PROVIDER ?? 'clerk',
    adminEmails: [],
    blobStorageProvider: process.env.BLOB_STORAGE_PROVIDER ?? 'filesystem',
    blobFsDir: process.env.BLOB_FS_DIR ?? './.blobs',
    r2AccountId: process.env.R2_ACCOUNT_ID ?? null,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? null,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? null,
    r2Bucket: process.env.R2_BUCKET ?? null,
    s3Region: process.env.S3_REGION ?? null,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? null,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? null,
    s3Bucket: process.env.S3_BUCKET ?? null,
    s3Endpoint: process.env.S3_ENDPOINT ?? null,
    qstashToken: process.env.QSTASH_TOKEN ?? null,
    qstashIngestWorkerUrl: process.env.QSTASH_INGEST_WORKER_URL ?? null,
  };
}

export function selectBlobStorage(
  provider: string,
  cfg: EnvConfig.Service,
): BlobStorageAdapter {
  switch (provider) {
    case 'filesystem':
      return createFilesystemBlobStorage(cfg.blobFsDir);
    case 'r2':
      return createR2BlobStorage(cfg);
    case 's3':
      return createS3BlobStorage(cfg);
    default:
      throw new Error(`Unknown BLOB_STORAGE_PROVIDER: ${provider}`);
  }
}

export { createFilesystemBlobStorage, createR2BlobStorage, createS3BlobStorage };

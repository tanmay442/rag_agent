// Live `EnvConfig` layer. Loads every env-derived infra variable in
// one place via Effect `Config`, with sensible defaults. All other
// infrastructure layers depend on `EnvConfig` instead of reading
// `process.env` directly. Note: this intentionally does NOT collide
// with the branding `AppConfig` (Effect Schema) exported from
// `@app/domain/app-config`; that one is file-loaded app config, this
// one is process-env infrastructure config.
import { Config, Effect, Layer } from 'effect';
import { EnvConfig } from '@app/domain';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EnvConfigLive = Layer.effect(
  EnvConfig,
  Effect.gen(function* () {
    const embeddingProvider = yield* Config.string('EMBEDDING_PROVIDER').pipe(
      Config.withDefault('google'),
    );
    const chatProvider = yield* Config.string('CHAT_PROVIDER').pipe(
      Config.withDefault('openai'),
    );
    const aiStudioKey = yield* Config.option(Config.string('AI_STUDIO_KEY'));
    const openaiEmbeddingApiKey = yield* Config.option(Config.string('OPENAI_EMBEDDING_API_KEY'));
    const openaiEmbeddingBaseUrl = yield* Config.option(Config.string('OPENAI_EMBEDDING_BASE_URL'));
    const openaiEmbeddingModel = yield* Config.string('OPENAI_EMBEDDING_MODEL').pipe(
      Config.withDefault('text-embedding-3-small'),
    );
    const customLlmApiKey = yield* Config.option(Config.string('CUSTOM_LLM_API_KEY'));
    const customLlmBaseUrl = yield* Config.option(Config.string('CUSTOM_LLM_BASE_URL'));
    const llmModel = yield* Config.string('LLM_MODEL').pipe(Config.withDefault('custom-chat-model'));
    const embeddingDimension = yield* Config.string('EMBEDDING_DIMENSION').pipe(
      Config.withDefault('768'),
      Config.map((s) => Number(s) || 768),
    );
    const ollamaBaseUrl = yield* Config.string('OLLAMA_BASE_URL').pipe(
      Config.withDefault('http://localhost:11434'),
    );
    const ollamaEmbeddingModel = yield* Config.string('OLLAMA_EMBEDDING_MODEL').pipe(
      Config.withDefault('nomic-embed-text'),
    );
    const ollamaChatModel = yield* Config.string('OLLAMA_CHAT_MODEL').pipe(
      Config.withDefault('llama3.1'),
    );
    const upstashRedisUrl = yield* Config.option(Config.string('UPSTASH_REDIS_REST_URL'));
    const upstashRedisToken = yield* Config.option(Config.string('UPSTASH_REDIS_REST_TOKEN'));
    const authProvider = yield* Config.string('AUTH_PROVIDER').pipe(Config.withDefault('clerk'));
    const adminEmailsRaw = yield* Config.string('ADMIN_EMAILS').pipe(Config.withDefault(''));
    const blobStorageProvider = yield* Config.string('BLOB_STORAGE_PROVIDER').pipe(
      Config.withDefault('filesystem'),
    );
    const blobFsDir = yield* Config.string('BLOB_FS_DIR').pipe(Config.withDefault('./.blobs'));
    const r2AccountId = yield* Config.option(Config.string('R2_ACCOUNT_ID'));
    const r2AccessKeyId = yield* Config.option(Config.string('R2_ACCESS_KEY_ID'));
    const r2SecretAccessKey = yield* Config.option(Config.string('R2_SECRET_ACCESS_KEY'));
    const r2Bucket = yield* Config.option(Config.string('R2_BUCKET'));
    const s3Region = yield* Config.option(Config.string('S3_REGION'));
    const s3AccessKeyId = yield* Config.option(Config.string('S3_ACCESS_KEY_ID'));
    const s3SecretAccessKey = yield* Config.option(Config.string('S3_SECRET_ACCESS_KEY'));
    const s3Bucket = yield* Config.option(Config.string('S3_BUCKET'));
    const s3Endpoint = yield* Config.option(Config.string('S3_ENDPOINT'));
    const qstashToken = yield* Config.option(Config.string('QSTASH_TOKEN'));
    const qstashIngestWorkerUrl = yield* Config.option(Config.string('QSTASH_INGEST_WORKER_URL'));

    return {
      embeddingProvider,
      chatProvider,
      aiStudioKey: aiStudioKey._tag === 'None' ? null : aiStudioKey.value,
      openaiEmbeddingApiKey:
        openaiEmbeddingApiKey._tag === 'None' ? null : openaiEmbeddingApiKey.value,
      openaiEmbeddingBaseUrl:
        openaiEmbeddingBaseUrl._tag === 'None' ? null : openaiEmbeddingBaseUrl.value,
      openaiEmbeddingModel,
      customLlmApiKey: customLlmApiKey._tag === 'None' ? null : customLlmApiKey.value,
      customLlmBaseUrl: customLlmBaseUrl._tag === 'None' ? null : customLlmBaseUrl.value,
      llmModel,
      embeddingDimension,
      ollamaBaseUrl,
      ollamaEmbeddingModel,
      ollamaChatModel,
      upstashRedisUrl: upstashRedisUrl._tag === 'None' ? null : upstashRedisUrl.value,
      upstashRedisToken: upstashRedisToken._tag === 'None' ? null : upstashRedisToken.value,
      authProvider,
      adminEmails: adminEmailsRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((e) => e && EMAIL_RE.test(e)),
      blobStorageProvider,
      blobFsDir,
      r2AccountId: r2AccountId._tag === 'None' ? null : r2AccountId.value,
      r2AccessKeyId: r2AccessKeyId._tag === 'None' ? null : r2AccessKeyId.value,
      r2SecretAccessKey: r2SecretAccessKey._tag === 'None' ? null : r2SecretAccessKey.value,
      r2Bucket: r2Bucket._tag === 'None' ? null : r2Bucket.value,
      s3Region: s3Region._tag === 'None' ? null : s3Region.value,
      s3AccessKeyId: s3AccessKeyId._tag === 'None' ? null : s3AccessKeyId.value,
      s3SecretAccessKey: s3SecretAccessKey._tag === 'None' ? null : s3SecretAccessKey.value,
      s3Bucket: s3Bucket._tag === 'None' ? null : s3Bucket.value,
      s3Endpoint: s3Endpoint._tag === 'None' ? null : s3Endpoint.value,
      qstashToken: qstashToken._tag === 'None' ? null : qstashToken.value,
      qstashIngestWorkerUrl:
        qstashIngestWorkerUrl._tag === 'None' ? null : qstashIngestWorkerUrl.value,
    } satisfies EnvConfig.Service;
  }),
);

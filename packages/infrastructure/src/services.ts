// Live Effect service layers for the non-DB ports. Each layer reads
// its configuration from the `EnvConfig` service (loaded via Effect
// `Config` in ./config.ts) and wraps the underlying adapter — which
// still returns Promises — into an Effect service via
// `Effect.tryPromise`. No layer reads `process.env` or `Config.*`
// directly; `EnvConfig` is the single source of truth. `RedisClient`
// is built once and shared by the Upstash-backed rate limiter and
// query stats layers.
import { Effect, Layer } from 'effect';
import { createHash } from 'node:crypto';
import {
  Embeddings,
  BlobStorage,
  IngestQueue,
  PdfParser,
  TextSplitter,
  RateLimiter,
  QueryStats,
  Clock,
  Hasher,
  SessionStore,
  RedisClient,
  EnvConfig,
  ExternalServiceError,
  RateLimitedError,
} from '@app/domain';
import { getEmbeddingServiceFromConfig } from './llm';
import { selectBlobStorage } from './storage/blob-storage-factory';
import { selectIngestQueue } from './queue';
import { pdfParseParser, langchainSplitter } from './pdf';
import {
  lruRateLimiter,
  createUpstashRateLimiter,
  inMemoryQueryStats,
  createUpstashQueryStats,
  clerkSessionStore,
} from './auth';
import { Redis } from '@upstash/redis';
import { EnvConfigLive } from './config';

export const RedisClientLive = Layer.effect(
  RedisClient,
  Effect.gen(function* () {
    const cfg = yield* EnvConfig;
    if (!cfg.upstashRedisUrl || !cfg.upstashRedisToken) {
      return { redis: null };
    }
    return { redis: new Redis({ url: cfg.upstashRedisUrl, token: cfg.upstashRedisToken }) };
  }),
);

export const EmbeddingsLive = Layer.effect(
  Embeddings,
  Effect.gen(function* () {
    const cfg = yield* EnvConfig;
    const svc = getEmbeddingServiceFromConfig(cfg);
    return {
      embed: (value: string) =>
        Effect.tryPromise({ try: () => svc.embed(value), catch: (e) => new ExternalServiceError('Embedding failed', e) }),
      embedBatch: (values: string[]) =>
        Effect.tryPromise({ try: () => svc.embedBatch(values), catch: (e) => new ExternalServiceError('Embedding batch failed', e) }),
    } satisfies Embeddings.Service;
  }),
);

export const BlobStorageLive = Layer.effect(
  BlobStorage,
  Effect.gen(function* () {
    const cfg = yield* EnvConfig;
    const svc = selectBlobStorage(cfg.blobStorageProvider, cfg);
    return {
      put: (key: string, body: Buffer, contentType: string) =>
        Effect.tryPromise({ try: () => svc.put(key, body, contentType), catch: (e) => new ExternalServiceError('Blob put failed', e) }),
      get: (key: string) =>
        Effect.tryPromise({ try: () => svc.get(key), catch: (e) => new ExternalServiceError('Blob get failed', e) }),
      stream: (key: string) =>
        Effect.tryPromise({ try: () => svc.stream(key), catch: (e) => new ExternalServiceError('Blob stream failed', e) }),
      delete: (key: string) =>
        Effect.tryPromise({ try: () => svc.delete(key), catch: (e) => new ExternalServiceError('Blob delete failed', e) }),
      signedUrl: (key: string, ttlSec: number) =>
        Effect.tryPromise({
          try: () => (svc.signedUrl ? svc.signedUrl(key, ttlSec) : Promise.reject(new Error('signedUrl not supported'))),
          catch: (e) => new ExternalServiceError('Blob signedUrl failed', e),
        }),
    } satisfies BlobStorage.Service;
  }),
);

export const IngestQueueLive = Layer.effect(
  IngestQueue,
  Effect.gen(function* () {
    const cfg = yield* EnvConfig;
    const svc = selectIngestQueue(!!cfg.qstashToken, cfg);
    return {
      enqueue: (payload: { documentId: number }) =>
        Effect.tryPromise({ try: () => svc.enqueue(payload), catch: (e) => new ExternalServiceError('Ingest enqueue failed', e) }),
    } satisfies IngestQueue.Service;
  }),
);

export const PdfParserLive = Layer.sync(PdfParser, () => {
  const svc = pdfParseParser;
  return {
    extractText: (buffer: Buffer) =>
      Effect.tryPromise({ try: () => svc.extractText(buffer), catch: (e) => new ExternalServiceError('PDF parsing failed', e) }),
  } satisfies PdfParser.Service;
});

export const TextSplitterLive = Layer.sync(TextSplitter, () => {
  const svc = langchainSplitter;
  return {
    splitText: (text: string) =>
      Effect.tryPromise({ try: () => svc.splitText(text), catch: (e) => new ExternalServiceError('Text splitting failed', e) }),
  } satisfies TextSplitter.Service;
});

export const RateLimiterLive = Layer.effect(
  RateLimiter,
  Effect.gen(function* () {
    const cfg = yield* EnvConfig;
    const redis = cfg.upstashRedisUrl && cfg.upstashRedisToken ? yield* RedisClient : null;
    const svc = redis ? createUpstashRateLimiter(redis.redis as Redis) : lruRateLimiter;
    return {
      check: (key: string, opts: { limit: number; windowMs: number }) =>
        Effect.tryPromise({
          try: () => svc.check(key, opts),
          catch: (e) => new ExternalServiceError('Rate limit check failed', e),
        }).pipe(
          Effect.flatMap((r) =>
            r.ok
              ? Effect.succeed({ remaining: r.remaining, resetMs: r.resetMs })
              : Effect.fail(new RateLimitedError('Rate limit exceeded', r.retryAfterMs)),
          ),
        ),
    } satisfies RateLimiter.Service;
  }),
);

export const QueryStatsLive = Layer.effect(
  QueryStats,
  Effect.gen(function* () {
    const cfg = yield* EnvConfig;
    const redis = cfg.upstashRedisUrl && cfg.upstashRedisToken ? yield* RedisClient : null;
    const svc = redis ? createUpstashQueryStats(redis.redis as Redis) : inMemoryQueryStats;
    return {
      record: (userId: string, query: string) =>
        Effect.tryPromise({ try: () => svc.record(userId, query), catch: (e) => new ExternalServiceError('Query stats record failed', e) }),
      top: (limit: number) =>
        Effect.tryPromise({ try: () => svc.top(limit), catch: (e) => new ExternalServiceError('Query stats top failed', e) }),
    } satisfies QueryStats.Service;
  }),
);

export const ClockLive = Layer.succeed(Clock, {
  now: () => Effect.succeed(new Date()),
});

export const HasherLive = Layer.succeed(Hasher, {
  sha256: (buf: Buffer) => Effect.succeed(createHash('sha256').update(buf).digest('hex')),
});

export const SessionStoreLive = Layer.effect(
  SessionStore,
  Effect.gen(function* () {
    yield* EnvConfig;
    return {
      getSession: () =>
        Effect.tryPromise({ try: () => clerkSessionStore.getSession(), catch: (e) => new ExternalServiceError('Session resolve failed', e) }),
    } satisfies SessionStore.Service;
  }),
);

export { DbServicesLayer } from './db/services';

// All infra (non-DB) layers, each provided with EnvConfigLive so they
// read a single shared config source. RedisClientLive is provided to
// the Upstash-backed layers; it resolves to a null client (and the
// in-memory fallback is used) when Upstash env vars are absent.
const infraLayers = Layer.mergeAll(
  EmbeddingsLive,
  BlobStorageLive,
  IngestQueueLive,
  PdfParserLive,
  TextSplitterLive,
  RateLimiterLive,
  QueryStatsLive,
  ClockLive,
  HasherLive,
  SessionStoreLive,
);

export const InfraServicesLayer = infraLayers.pipe(
  Layer.provide(RedisClientLive),
  Layer.provide(EnvConfigLive),
);

// Re-export env-backed factories for call sites that need a raw
// adapter outside the Effect runtime (composition root, CLI seed).
export { createBlobStorage } from './storage/blob-storage-factory';
export { getEmbeddingService } from './llm';
export { createIngestQueue } from './queue';
export { createUpstashRateLimiter, createUpstashQueryStats, lruRateLimiter, inMemoryQueryStats } from './auth';

// Live Effect service layers for the non-DB ports. Each layer wraps
// the existing plain-object adapter (which returns Promises) into an
// Effect service via `Effect.tryPromise`. The adapters themselves are
// rewritten to be Effect-native in a later session; this is the bridge.
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
  ExternalServiceError,
  RateLimitedError,
} from '@app/domain';
import { getEmbeddingService } from './llm';
import { createBlobStorage } from './storage/blob-storage-factory';
import { createIngestQueue } from './queue';
import { pdfParseParser, langchainSplitter } from './pdf';
import {
  lruRateLimiter,
  createUpstashRateLimiter,
  inMemoryQueryStats,
  createUpstashQueryStats,
  clerkSessionStore,
} from './auth';

function makeRateLimiterAdapter() {
  if (process.env.UPSTASH_REDIS_REST_URL) return createUpstashRateLimiter();
  return lruRateLimiter;
}

function makeQueryStatsAdapter() {
  if (process.env.UPSTASH_REDIS_REST_URL) return createUpstashQueryStats();
  return inMemoryQueryStats;
}

export const EmbeddingsLive = Layer.sync(Embeddings, () => {
  const svc = getEmbeddingService();
  return {
    embed: (value: string) =>
      Effect.tryPromise({ try: () => svc.embed(value), catch: (e) => new ExternalServiceError('Embedding failed', e) }),
    embedBatch: (values: string[]) =>
      Effect.tryPromise({ try: () => svc.embedBatch(values), catch: (e) => new ExternalServiceError('Embedding batch failed', e) }),
  } satisfies Embeddings.Service;
});

export const BlobStorageLive = Layer.sync(BlobStorage, () => {
  const svc = createBlobStorage();
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
});

export const IngestQueueLive = Layer.sync(IngestQueue, () => {
  const svc = createIngestQueue();
  return {
    enqueue: (payload: { documentId: number }) =>
      Effect.tryPromise({ try: () => svc.enqueue(payload), catch: (e) => new ExternalServiceError('Ingest enqueue failed', e) }),
  } satisfies IngestQueue.Service;
});

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

export const RateLimiterLive = Layer.sync(RateLimiter, () => {
  const svc = makeRateLimiterAdapter();
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
});

export const QueryStatsLive = Layer.sync(QueryStats, () => {
  const svc = makeQueryStatsAdapter();
  return {
    record: (userId: string, query: string) =>
      Effect.tryPromise({ try: () => svc.record(userId, query), catch: (e) => new ExternalServiceError('Query stats record failed', e) }),
    top: (limit: number) =>
      Effect.tryPromise({ try: () => svc.top(limit), catch: (e) => new ExternalServiceError('Query stats top failed', e) }),
  } satisfies QueryStats.Service;
});

export const ClockLive = Layer.succeed(Clock, {
  now: () => Effect.succeed(new Date()),
});

export const HasherLive = Layer.succeed(Hasher, {
  sha256: (buf: Buffer) => Effect.succeed(createHash('sha256').update(buf).digest('hex')),
});

export const SessionStoreLive = Layer.sync(SessionStore, () => {
  const svc = clerkSessionStore;
  return {
    getSession: () =>
      Effect.tryPromise({ try: () => svc.getSession(), catch: (e) => new ExternalServiceError('Session resolve failed', e) }),
  } satisfies SessionStore.Service;
});

export { DbServicesLayer } from './db/services';

export const InfraServicesLayer = Layer.mergeAll(
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

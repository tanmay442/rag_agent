// Promise-based adapter shapes for the legacy infrastructure adapters.
//
// These describe the plain-object adapters that still return Promises
// (PDF parser, embedding services, blob storage, queue, rate limiter,
// query stats, session store). The live Effect layers in ./services.ts
// wrap these into Effect services. The adapters themselves become
// Effect-native in a later session; this keeps their public shape
// stable in the meantime.

export interface EmbeddingService {
  embed(value: string): Promise<number[]>;
  embedBatch(values: string[]): Promise<number[][]>;
}

export interface BlobStorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  signedUrl?(key: string, ttlSec: number): Promise<string>;
}

export interface IngestQueueAdapter {
  enqueue(payload: { documentId: number }): Promise<void>;
}

export interface PdfParserAdapter {
  extractText(buffer: Buffer): Promise<string>;
}

export interface TextSplitterAdapter {
  splitText(text: string): Promise<string[]>;
}

export interface RateLimitAllowed {
  ok: true;
  remaining: number;
  resetMs: number;
}
export interface RateLimitBlocked {
  ok: false;
  retryAfterMs: number;
}
export interface RateLimiterAdapter {
  check(key: string, opts: { limit: number; windowMs: number }): Promise<RateLimitAllowed | RateLimitBlocked>;
}

export interface QueryStatsAdapter {
  record(userId: string, query: string): Promise<void>;
  top(limit: number): Promise<Array<{ q: string; count: number }>>;
}

export interface SessionStoreAdapter {
  getSession(): Promise<{
    user: {
      id: string;
      email: string;
      name: string;
      imageUrl: string | null;
      role: 'admin' | 'user';
    };
  } | null>;
}

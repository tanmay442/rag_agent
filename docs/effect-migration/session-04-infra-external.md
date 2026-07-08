# Session 04: Infrastructure — External Services (LLM, Auth, Storage, Config)

## Objective

Convert all remaining infrastructure adapters to proper Effect services with
live layers. Create `AppConfig` service using Effect `Config`. This completes
the infrastructure layer — by the end of this session, every external
dependency is wrapped in an Effect service.

---

## Dev Environment Check

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

---

## Context from Prior Sessions

Read `docs/effect-migration/context/after-session-03.md` first.

Key things to know:
- All services are `Context.Service` definitions (in `packages/domain/src/services.ts`)
- DB repositories are Effect services with live layers
- `Effect<A,E,R>` is the standard return type everywhere
- `Result<T,E>` is gone

---

## Implementation

### Phase 1: LLM Services

#### 1. Convert Embedding Services

Files:
- `packages/infrastructure/src/llm/index.ts`
- `packages/infrastructure/src/llm/google-embedding-service.ts`
- `packages/infrastructure/src/llm/google-embedding-service-port.ts`
- `packages/infrastructure/src/llm/openai-embedding-service.ts`
- `packages/infrastructure/src/llm/ollama-embedding-service.ts`
- `packages/infrastructure/src/llm/embedding-batch-helper.ts`

**First**, define the `AppConfig` service (see Phase 4, step 10) which
holds all env-derived config including `EMBEDDING_PROVIDER`. The LLM
layer depends on `AppConfig` to know which provider to use.

**Pattern:** Create a live layer for the Embeddings service:

```typescript
import { Effect, Layer } from "effect";
import { Embeddings, AppConfig } from "@app/domain";

export const EmbeddingsLive = Layer.effect(
  Embeddings,
  Effect.gen(function* () {
    const config = yield* AppConfig;  // provides embeddingProvider, apiKey, etc.
    const model = getEmbeddingModel(config);  // selects Google/OpenAI/Ollama
    return {
      embed: (value) => Effect.tryPromise({
        try: () => model.embed(value),
        catch: (e) => new ExternalServiceError('Embedding failed', e),
      }),
      embedBatch: (values) => embedBatchWithModel(model, values),
    };
  })
);
```

#### 2. Convert Chat Model

Files:
- `packages/infrastructure/src/llm/openai-chat-service.ts`
- `packages/infrastructure/src/llm/google-chat-service.ts`
- `packages/infrastructure/src/llm/ollama-chat-service.ts`

**Pattern:** Create `ChatModelLive` layer. Same dependency on `AppConfig`
for `CHAT_PROVIDER` selection.

#### 3. Update LLM index

`packages/infrastructure/src/llm/index.ts` — export all live layers.

### Phase 2: Auth Services

#### 4. Convert Auth Adapter

Files:
- `packages/infrastructure/src/auth/clerk-adapter.ts`
- `packages/infrastructure/src/auth/clerk-session.ts`
- `packages/infrastructure/src/auth/auth-factory.ts`

**Pattern:** The Clerk adapter is tricky because it uses Next.js-specific
middleware. The `SessionStore` service wraps the session resolution:

```typescript
export const SessionStoreLive = Layer.effect(
  SessionStore,
  Effect.gen(function* () {
    return {
      getSession: () => Effect.tryPromise({
        try: async () => {
          const { auth } = await import('@clerk/nextjs/server');
          const session = await auth();
          // ... resolve session
        },
        catch: (e) => new UnauthorizedError('Session resolution failed'),
      }),
    };
  })
);
```

**Note:** The Clerk middleware in `src/proxy.ts` stays as-is — it runs
in edge runtime and doesn't benefit from Effect. Only the session
resolution used by API routes and actions gets the Effect treatment.

#### 5. Convert Rate Limiter

Files:
- `packages/infrastructure/src/auth/lru-rate-limiter.ts`
- `packages/infrastructure/src/auth/upstash-rate-limiter.ts`

**First**, define a `RedisClient` service to hold the Upstash Redis
connection (avoids creating a new client per request):

```typescript
import { Context, Layer, Effect } from "effect";
import { Redis } from "@upstash/redis";
import { AppConfig } from "@app/domain";

export class RedisClient extends Context.Service<RedisClient, {
  readonly redis: Redis;
}>()("@app/RedisClient") {}

export const RedisClientLive = Layer.effect(
  RedisClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;  // provides upstashUrl, upstashToken
    const redis = new Redis({ url: config.upstashUrl, token: config.upstashToken });
    return { redis };
  })
);
```

Then create the rate limiter layers:

```typescript
export const LruRateLimiterLive = Layer.succeed(RateLimiter, {
  check: (key, opts) => Effect.sync(() => { /* LRU logic */ }),
});

export const UpstashRateLimiterLive = Layer.effect(
  RateLimiter,
  Effect.gen(function* () {
    const { redis } = yield* RedisClient;  // shared client, not per-request
    return {
      check: (key, opts) => Effect.tryPromise({
        try: () => redis.incr(/* ... */),
        catch: (e) => new ExternalServiceError('Rate limit check failed', e),
      }),
    };
  })
);
```

Select between them in `composition.ts` based on `AppConfig`.

#### 6. Convert Query Stats

Files:
- `packages/infrastructure/src/auth/in-memory-query-stats.ts`
- `packages/infrastructure/src/auth/upstash-query-stats.ts`

**Pattern:** Same as rate limiter — the Upstash implementation depends on
`RedisClient` (shared). Create `InMemoryQueryStatsLive` and
`UpstashQueryStatsLive` layers.

### Phase 3: Storage, Queue, PDF

#### 7. Convert Blob Storage

Files:
- `packages/infrastructure/src/storage/blob-storage-fs.ts`
- `packages/infrastructure/src/storage/blob-storage-r2.ts`
- `packages/infrastructure/src/storage/blob-storage-s3.ts`
- `packages/infrastructure/src/storage/blob-storage-factory.ts`

**Pattern:** Read the provider from `AppConfig`:

```typescript
export const BlobStorageLive = Layer.effect(
  BlobStorage,
  Effect.gen(function* () {
    const config = yield* AppConfig;  // provides blobStorageProvider, r2/s3 creds
    if (config.blobStorageProvider === 'r2') return createR2Impl(config);
    if (config.blobStorageProvider === 's3') return createS3Impl(config);
    return createFsImpl(config);
  })
);
```

#### 8. Convert Queue

Files:
- `packages/infrastructure/src/queue/qstash-queue.ts`
- `packages/infrastructure/src/queue/sync-queue.ts`
- `packages/infrastructure/src/queue/index.ts`

**Pattern:** Create `IngestQueueLive` layer. Depends on `AppConfig` for
`QSTASH_TOKEN` and `QSTASH_INGEST_WORKER_URL`.

#### 9. Convert PDF Parser and Text Splitter

Files:
- `packages/infrastructure/src/pdf/pdf-parse-parser.ts`
- `packages/infrastructure/src/pdf/langchain-splitter.ts`

**Pattern:** Create `PdfParserLive` and `TextSplitterLive` layers. These
are simple — no config dependencies, just wrap the libraries in
`Effect.tryPromise`.

### Phase 4: Config & Clock

#### 10. Create `AppConfig` Service

**This is the central config service** that all other layers depend on.
It loads ALL env vars via Effect `Config` in one place. Every other
service that needs env-derived config depends on `AppConfig` — not on
`process.env` or Effect `Config` directly.

Add to `packages/domain/src/services.ts`:

```typescript
export class AppConfig extends Context.Service<AppConfig, {
  readonly orgName: string;
  readonly agentName: string;
  readonly prefetchFirstTurn: boolean;
  readonly embeddingProvider: string;
  readonly chatProvider: string;
  readonly upstashRedisUrl: string | null;
  readonly upstashRedisToken: string | null;
  readonly blobStorageProvider: string;
  readonly r2AccountId: string | null;
  readonly r2AccessKeyId: string | null;
  readonly r2SecretAccessKey: string | null;
  readonly r2Bucket: string | null;
  // ... all env-derived config fields
}>()("@app/AppConfig") {}
```

Create the live layer in `packages/infrastructure/src/config.ts`:

```typescript
import { Config, Effect, Layer } from "effect";
import { AppConfig } from "@app/domain";

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const orgName = yield* Config.string("ORG_NAME").pipe(
      Config.orElse(() => Config.succeed("Acme Corp"))
    );
    const embeddingProvider = yield* Config.string("EMBEDDING_PROVIDER").pipe(
      Config.orElse(() => Config.succeed("google"))
    );
    const upstashRedisUrl = yield* Config.option(Config.string("UPSTASH_REDIS_REST_URL"));
    // ... load all env vars with Config, provide defaults
    return {
      orgName,
      embeddingProvider,
      upstashRedisUrl: upstashRedisUrl._tag === "None" ? null : upstashRedisUrl.value,
      // ... etc
    };
  })
);
```

**Key point:** `AppConfig` is the single source of truth for env-derived
configuration. LLM, Auth, Storage, and Queue layers all read from
`AppConfig` — they never call `Config.string()` or `process.env`
directly. This makes testing easy: provide a test `AppConfig` layer
with hardcoded values.

#### 11. Create `ClockLive`

Use Effect's built-in `Clock` service. The **Live** clock is already
available — no custom layer needed:

```typescript
import { Clock } from "effect";
// In composition.ts: appLayer includes Clock.live (or Layer.effect(Clock, ...))
```

If the domain defines a custom `Clock` service (with `now(): Date`
instead of `currentTimeMillis: number`), create a thin adapter:

```typescript
import { Clock as EffectClock, Effect, Layer } from "effect";
import { Clock } from "@app/domain";

export const ClockLive = Layer.succeed(Clock, {
  now: () => Effect.flatMap(EffectClock.currentTimeMillis, (ms) =>
    Effect.sync(() => new Date(ms))
  ),
});
```

#### 12. Create `HasherLive`

```typescript
import { createHash } from "node:crypto";
import { Layer } from "effect";
import { Hasher } from "@app/domain";

export const HasherLive = Layer.succeed(Hasher, {
  sha256: (buf) => createHash('sha256').update(buf).digest('hex'),
});
```

### Phase 5: Infrastructure Index

#### 13. Update `packages/infrastructure/src/index.ts`

Export all live layers from a single namespace:

```typescript
import * as Db from "./db";
import * as Llm from "./llm";
import * as Auth from "./auth";
import * as Storage from "./storage";
import * as Queue from "./queue";
import * as Pdf from "./pdf";

export { Db, Llm, Auth, Storage, Queue, Pdf };
```

---

## Env Vars

No new env vars. No existing env vars changed. All env vars are now
read via Effect `Config` inside the service layers, but the env var
names themselves don't change.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

- All infrastructure adapter files — rewritten with Effect live layers
- `packages/infrastructure/src/db/services.ts` — updated with all layers
- `packages/infrastructure/src/index.ts` — updated exports
- New files: `AppConfigLive`, `ClockLive`, `HasherLive` layers

---

## Gotchas / Things to Watch Out For

1. **Layer memoization**: Effect memoizes layers by reference. Store
   layer instances in constants to avoid creating duplicates.

2. **Config loading**: Effect `Config` reads env vars at layer
   construction time. If env vars are missing, the layer fails to
   build — which is good for early error detection.

3. **Clerk edge runtime**: The Clerk middleware runs in edge runtime.
   Keep `src/proxy.ts` as-is. Only wrap the session resolution used
   by API routes.

4. **Upstash Redis client**: The `@upstash/redis` client is created
   once per layer. Don't create a new client on each request.

---

## Validation

```bash
pnpm typecheck    # tsc — must pass
pnpm lint         # eslint — must pass
pnpm test         # vitest run — all 230 tests must pass
pnpm arch         # dependency-cruiser — must pass
```

---

## Git Commit Strategy

```bash
git add -A
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(effect-04): convert external services to Effect layers

Convert LLM (embed/chat), auth (Clerk), blob storage (fs/R2/S3),
queue (QStash/sync), rate limiter (LRU/Upstash), query stats,
PDF parsing, and text splitting to Effect services with live layers.
Create AppConfig service via Effect Config. Create Clock and Hasher
services. All infrastructure is now Effect-native.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

---

## Handoff Instructions

Write `docs/effect-migration/context/after-session-04.md`. Include:

1. **List all live layers created**: from each infrastructure module
2. **Confirm AppConfig**: how config is loaded (Effect Config, defaults)
3. **Note any edge runtime limitations**: Clerk middleware stays as-is
4. **Confirm all 230 tests pass**
5. **Tell the next agent**: "All infrastructure is now Effect services with
   live layers. Session 5 will refine application use-cases to idiomatic
   Effect patterns."

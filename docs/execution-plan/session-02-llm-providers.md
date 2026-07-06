# Session 02: LLM Provider Switch — `EMBEDDING_PROVIDER` / `CHAT_PROVIDER`

## Objective

Make LLM providers env-swappable at the adapter seam. Add
`EMBEDDING_PROVIDER` and `CHAT_PROVIDER` env vars that switch between
Google, OpenAI, and Ollama adapters. This enables zero-key local
testing via Ollama (no external API calls needed) while keeping the
defaults (Google embeddings + OpenAI-compatible chat) unchanged for
production.

This session is positioned second so that sessions 3-6 can be
validated locally without API keys.

---

## Dev Environment Check

Run these before starting. If any fail, stop and inform the developer.

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # must be clean
```

Optional (for zero-key testing):
```bash
# If you want to test with Ollama locally:
docker --version        # needed to run ollama container
# ollama itself will be added via docker-compose in Session 8
```

---

## Context from Prior Sessions

Read `docs/execution-plan/context/after-session-01.md` first. The DB
driver swap from Session 1 should be complete. Key things to know:

- The DB layer uses `@neondatabase/serverless` now.
- `packages/infrastructure/src/db/pool.ts` and `client.ts` have been
  rewritten.
- All tests pass with the new driver.

### Files to Read First

- `packages/infrastructure/src/llm/index.ts` — current exports
  (direct re-exports of Google embedding + OpenAI chat)
- `packages/infrastructure/src/llm/google-embedding-service.ts` —
  factory `getEmbeddingModel()`, throws if `AI_STUDIO_KEY` unset
- `packages/infrastructure/src/llm/google-embedding-service-port.ts` —
  wraps the model into `EmbeddingService` port with batching logic
- `packages/infrastructure/src/llm/openai-chat-service.ts` — factory
  `getChatModel()`, throws if `CUSTOM_LLM_API_KEY` / `CUSTOM_LLM_BASE_URL`
  unset
- `src/composition.ts` — lines 42, 45, 90-91 reference
  `Llm.googleEmbeddingService` and `Llm.getChatModel`
- `packages/domain/src/ports.ts` — `EmbeddingService` port (line 183)
- `config/constants.ts` — `EMBEDDING_BATCH_SIZE`,
  `EMBEDDING_BATCH_CONCURRENCY`

---

## Implementation

### 1. Create `packages/infrastructure/src/llm/openai-embedding-service.ts`

An `EmbeddingService` implementation using the OpenAI-compatible
embeddings API. Uses `@ai-sdk/openai` (already a dependency).

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { embed } from 'ai';
import type { EmbeddingService } from '@app/domain';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_BATCH_CONCURRENCY } from '../../../../config/constants';

export function getOpenAIEmbeddingModel(): EmbeddingModelV3 {
  const apiKey = process.env.OPENAI_EMBEDDING_API_KEY ?? process.env.CUSTOM_LLM_API_KEY;
  const baseURL = process.env.OPENAI_EMBEDDING_BASE_URL ?? process.env.CUSTOM_LLM_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error('OPENAI_EMBEDDING_API_KEY and OPENAI_EMBEDDING_BASE_URL must be set (or CUSTOM_LLM_API_KEY/CUSTOM_LLM_BASE_URL).');
  }
  const provider = createOpenAI({ apiKey, baseURL });
  const modelId = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  return provider.textEmbedding(modelId) as EmbeddingModelV3;
}
```

Implement `embed` and `embedBatch` the same way as
`google-embedding-service-port.ts` but using the OpenAI model. Factor
the batch-processing logic (the `processBatch` function with retry)
into a shared helper to avoid duplication — see step 3 below.

### 2. Create `packages/infrastructure/src/llm/ollama-embedding-service.ts`

Ollama exposes an OpenAI-compatible endpoint at `/v1`. Use
`@ai-sdk/openai` pointed at `OLLAMA_BASE_URL`.

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import type { EmbeddingService } from '@app/domain';

export function getOllamaEmbeddingModel(): EmbeddingModelV3 {
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const provider = createOpenAI({ apiKey: 'ollama', baseURL: `${baseURL}/v1` });
  const modelId = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
  return provider.textEmbedding(modelId) as EmbeddingModelV3;
}
```

No API key required. The `nomic-embed-text` model produces 768-dim
embeddings, matching the pgvector column size.

### 3. Create `packages/infrastructure/src/llm/embedding-batch-helper.ts`

Extract the `processBatch` function from
`google-embedding-service-port.ts` into a shared helper that takes a
model and embedding options. Both the Google and OpenAI/Ollama
embedding services use it.

```typescript
import { embed } from 'ai';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_BATCH_CONCURRENCY } from '../../../../config/constants';

export async function embedBatchWithModel(
  values: string[],
  model: EmbeddingModelV3,
  providerOptions?: Record<string, unknown>,
): Promise<number[][]> {
  // ... same logic as processBatch in google-embedding-service-port.ts
}
```

### 4. Create `packages/infrastructure/src/llm/ollama-chat-service.ts`

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

export function getOllamaChatModel(): LanguageModelV3 {
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const provider = createOpenAI({ apiKey: 'ollama', baseURL: `${baseURL}/v1` });
  const modelId = process.env.OLLAMA_CHAT_MODEL || 'llama3.1';
  return provider.chat(modelId) as LanguageModelV3;
}
```

### 5. Create `packages/infrastructure/src/llm/google-chat-service.ts` (optional)

For users who want Google for both embedding and chat:

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV3 } from '@ai-sdk/provider';

export function getGoogleChatModel(): LanguageModelV3 {
  const apiKey = process.env.AI_STUDIO_KEY;
  if (!apiKey) throw new Error('AI_STUDIO_KEY is not set.');
  const google = createGoogleGenerativeAI({ apiKey });
  return google.chat('gemini-1.5-flash') as LanguageModelV3;
}
```

### 6. Refactor `packages/infrastructure/src/llm/google-embedding-service-port.ts`

Update to use the shared `embedBatchWithModel` helper from step 3.
The `embed` method stays as-is (single value). The `embedBatch` method
delegates to the helper.

### 7. Rewrite `packages/infrastructure/src/llm/index.ts`

Replace direct re-exports with factory functions:

```typescript
import type { EmbeddingService, } from '@app/domain';
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';

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

export { EMBEDDING_OPTIONS } from './google-embedding-service';
```

Each adapter keeps the fail-fast-on-missing-key pattern at call time
(not import time).

### 8. Update `src/composition.ts`

Change lines that reference `Llm.googleEmbeddingService` and
`Llm.getChatModel`:

```typescript
// Line ~42: was Llm.googleEmbeddingService
const embeddingService = Llm.getEmbeddingService();

const ingestDeps: IngestDeps = {
  documents: documentRepo, chunks: chunkRepo,
  embeddings: embeddingService,  // <-- changed
  hasher: systemHasher,
  pdfParser: Pdf.pdfParseParser, textSplitter: Pdf.langchainSplitter,
};
const searchDeps: SearchDeps = { chunks: chunkRepo, embeddings: embeddingService };

// Line ~90-91: was Llm.getEmbeddingModel, Llm.getChatModel
getEmbeddingModel: Llm.getEmbeddingModel,  // keep for backward compat
getChatModel: Llm.getChatModel,            // now dispatches via factory
```

---

## Env Vars

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| `EMBEDDING_PROVIDER` | no | `google` | `google` \| `openai` \| `ollama` |
| `CHAT_PROVIDER` | no | `openai` | `openai` \| `google` \| `ollama` |
| `OLLAMA_BASE_URL` | if using ollama | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_EMBEDDING_MODEL` | no | `nomic-embed-text` | Ollama embedding model |
| `OLLAMA_CHAT_MODEL` | no | `llama3.1` | Ollama chat model |
| `OPENAI_EMBEDDING_API_KEY` | if `EMBEDDING_PROVIDER=openai` | — | Falls back to `CUSTOM_LLM_API_KEY` |
| `OPENAI_EMBEDDING_BASE_URL` | if `EMBEDDING_PROVIDER=openai` | — | Falls back to `CUSTOM_LLM_BASE_URL` |
| `OPENAI_EMBEDDING_MODEL` | no | `text-embedding-3-small` | OpenAI embedding model |

Existing env vars unchanged: `AI_STUDIO_KEY`, `CUSTOM_LLM_API_KEY`,
`CUSTOM_LLM_BASE_URL`, `LLM_MODEL`.

---

## Schema / Migration Changes

None.

---

## What Changed in the Codebase Structure

New files:
- `packages/infrastructure/src/llm/openai-embedding-service.ts`
- `packages/infrastructure/src/llm/ollama-embedding-service.ts`
- `packages/infrastructure/src/llm/ollama-chat-service.ts`
- `packages/infrastructure/src/llm/google-chat-service.ts`
- `packages/infrastructure/src/llm/embedding-batch-helper.ts`

Modified:
- `packages/infrastructure/src/llm/index.ts` — factory functions
- `packages/infrastructure/src/llm/google-embedding-service-port.ts` —
  uses shared helper
- `src/composition.ts` — uses `getEmbeddingService()` / `getChatModel()`

---

## Gotchas / Things to Watch Out For

1. **Embedding dimension mismatch**: The pgvector column is 768-dim
   (from `EMBEDDING_DIMENSION` env var). `nomic-embed-text` (Ollama)
   produces 768-dim. `text-embedding-3-small` (OpenAI) produces 1536-dim
   by default — you must set `dimensions: 768` in the provider options
   or use a model that supports 768. If the dimension doesn't match,
   vector search will fail at runtime. Document this in the env var
   comments.

2. **Ollama not running**: If `EMBEDDING_PROVIDER=ollama` but Ollama
   isn't running, the adapter will fail at call time (not import time)
   with a connection error. This is the correct behavior — fail fast
   per-call, don't crash the boot.

3. **`@ai-sdk/openai` for Ollama**: Ollama's `/v1` endpoint is
   OpenAI-compatible, so `@ai-sdk/openai`'s `createOpenAI` works. No
   need for a separate Ollama SDK.

4. **Google chat model**: `gemini-1.5-flash` is used as the default
   Google chat model. This is separate from the embedding model
   (`gemini-embedding-001`). Don't confuse the two.

5. **Shared batch helper**: The `processBatch` function in
   `google-embedding-service-port.ts` has retry logic. When extracting
   it to `embedding-batch-helper.ts`, make sure the retry behavior is
   preserved for all providers, not just Google.

---

## Validation

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run — all tests must pass
pnpm arch         # dependency-cruiser
```

Add at least one test for the provider factory dispatch:
- Test that `getEmbeddingService()` returns the Google adapter when
  `EMBEDDING_PROVIDER=google` (or unset).
- Test that it returns the Ollama adapter when
  `EMBEDDING_PROVIDER=ollama`.
- Test that it throws on an unknown provider.

Existing tests mock `EmbeddingService`, so they should be unaffected.
The test count should not decrease.

---

## Git Commit Strategy

After all validation checks pass, create **one commit**:

```bash
git add <files changed in this session>
git commit --author="tanmay442 <goeltanmay442@gmail.com>" \
  -m "(session-02): add EMBEDDING_PROVIDER / CHAT_PROVIDER env switch

Add Google, OpenAI, and Ollama adapters behind the EmbeddingService
and chat model ports. Enables zero-key local testing via Ollama.
Defaults unchanged (Google embeddings + OpenAI chat).

Validation: typecheck ✓, lint ✓, test ✓, arch ✓"
```

Do NOT stage `docs/execution-plan/context/after-session-02.md`.
Do NOT push. The developer pushes when ready.

---

## Handoff Instructions

Write `docs/execution-plan/context/after-session-02.md`. Include:

1. **Which providers are implemented**: list all
   `EMBEDDING_PROVIDER` and `CHAT_PROVIDER` values that work.
2. **Embedding dimension notes**: which models produce 768-dim (matching
   pgvector) and which need configuration.
3. **Any changes to test shims or setup**: if you added test fixtures
   for the new adapters.
4. **Tell the next agent**: "LLM providers are now env-swappable via
   `EMBEDDING_PROVIDER` and `CHAT_PROVIDER`. Ollama works for zero-key
   local testing. The factory functions are in
   `packages/infrastructure/src/llm/index.ts`. The composition root
   (`src/composition.ts`) now calls `Llm.getEmbeddingService()` and
   `Llm.getChatModel()` instead of hard-coded adapters. Read
   `packages/infrastructure/src/llm/index.ts` to see the dispatch."

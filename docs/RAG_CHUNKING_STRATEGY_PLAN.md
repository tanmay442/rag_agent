# RAG & Chunking Improvement Plan

**Status:** **Implemented** — source changes complete; validation green for typecheck/lint/test/arch.
**Branch:** `exp`
**Status after cross-validation:** Two independent review agents validated the plan; their findings (blockers + majors) are **folded into this revision**. Key corrections: hybrid search now uses index-friendly bounded candidates + drops the broken RRF threshold; `docTitle` is fetched via JOIN (no new column); `unpdf` shape corrected; re-ingest made atomic + `force`-able; `semantic` strategy gets an injected `EmbeddingService` and reuses embeddings; reranker id mapping fixed; `RetrievedChunk` unified.

## Implementation summary

Delivered (source changes on `exp`):

- **Domain ports** (`packages/domain/src/ports.ts`): `CHUNKING_STRATEGIES` tuple + `ChunkingStrategy` type; `ParsedDocument` / `ParsedPage`; `SmartTextSplitter` (consumes `ParsedDocument`, `embeddings` opt); `RetrievedChunk` defined once (with `page`/`chunkIndex`/`section`/`docTitle`/`meta`); `Reranker` port + `RerankCandidate`; `ChunkRepository.searchHybrid`.
- **DB migration** `drizzle/0004_chunk_metadata_fts.sql`: `page`/`chunkIndex`/`section`/`meta` columns + `fts tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED` + GIN index (`chunks_fts_idx`, `CONCURRENTLY`).
- **unpdf** `extractDocument` (one `extractText` call, `mergePages:false`, empty-page guard) replacing the old `mergePages:true` path.
- **Strategy registry** `packages/infrastructure/src/pdf/strategies/index.ts` (`getChunkingStrategy`) + 3 strategies: `document-aware` (default), `recursive-adaptive`, `semantic` (mean-pools sentence embeddings; opt-in).
- **`searchHybrid`** single-SQL RRF CTE (bounded `vecK`/`ftsK`, returns `id` + `docTitle`, no threshold filter).
- **Rerankers** `packages/infrastructure/src/llm/rerank/` (`rrf`, `cohere`, `gemini`) + `getReranker` factory (falls back to `rrf` when key missing).
- **Ingest** atomic + `force`-able re-ingest (bypasses file-hash short-circuit; chunk replacement inside a transaction).
- **Composition wiring** (`src/composition.ts`): strategy + reranker selection via factories; app layer references only port types.
- **Citation / prompt updates**: citation string includes `page`/`section`/`docTitle`; `TOOL_CONTENT_CAP` (1100) imported; "open ticket" decoupled from the old 0.5 cosine threshold.
- **Admin UI + endpoint**: `/admin/settings` (active chunking + reranking strategy, "Re-ingest all" action) + `POST /api/admin/reingest` (`reingestAll`, atomic, force-able).
- **Tests**: `search.test.ts` (`searchHybrid`, `docTitle`, RRF non-empty, reranker fallback), `ingest.integration.test.ts` (`extractDocument`/`splitDocument` + metadata `insertMany`), `rerank/__tests__/rerank.test.ts`, `strategies/__tests__/*`.


**Scope decision:**

Adopted from the audit:
- Per-page parse + chunk metadata (A)
- Better chunk sizing + display-cap alignment (B)
- Hybrid search via Postgres FTS fused with **RRF** (C)
- **Re-ranking (D): default = RRF (free, local). User-configurable switch to an external API reranker (Cohere or Gemini).** ← explicit requirement
- Parent-child chunking (E) and query-rewrite/HyDE (F) are **deferred** (noted for later).

Adopted from the reviewed "Production-Grade Chunking" design (with fixes):
- **Plugin / strategy-registry pattern** for chunking.
- **`document-aware` default strategy** (per-page + heading inference) + `recursive-adaptive` + `semantic`.
- **FTS as a `GENERATED … STORED` tsvector column** + GIN index.
- **Admin UI** to switch strategy + a re-ingest endpoint.

---

## 1. Goals

1. **Provenance / citations:** Every chunk carries `page`, `chunkIndex`, `section`, `docTitle` (fetched via JOIN) so citations become `file.pdf p.12 (Section: Billing) — "…snippet…"`.
2. **Extensible chunking:** Strategy registry; add/compare chunkers without touching ingest/search/DB code.
3. **Better recall:** Keyword/FTS retrieval fused with vector retrieval (RRF).
4. **Better precision:** Re-rank fused candidates. Default = RRF (free). Optional config switch to Cohere/Gemini.
5. **Right-sized chunks:** document-aware targets ~800-char sections; align `TOOL_CONTENT_CAP`/prefetch cap.
6. **Architecture-safe:** Stay within port boundaries; keep `pnpm arch` green.

---

## 2. As-is architecture (file references)

| Stage | File | Notes |
|-------|------|-------|
| Parse | `packages/infrastructure/src/pdf/unpdf-parser.ts:5` | `mergePages:true` → page numbers discarded |
| Split | `packages/infrastructure/src/pdf/langchain-splitter.ts:5` | `RecursiveCharacterTextSplitter({chunkSize:350, chunkOverlap:50})` — **deleted** |
| Ports | `packages/domain/src/ports.ts` | `PdfParser.extractText`, `TextSplitter.splitText`, `ChunkRepository.searchByVector`, `EmbeddingService` |
| Ingest | `packages/application/src/rag/ingest.ts:36` `parseAndEmbed` | builds `{content, embedding}`; no metadata |
| Store | `packages/infrastructure/src/db/schema.ts:26` `chunks` | `id, documentId, content, embedding` only |
| Search | `packages/application/src/rag/search.ts:23` `searchChunks` | single cosine vector, `threshold`, `limit` |
| SQL | `packages/infrastructure/src/db/repositories.ts:98` `searchChunksByVector` | cosine; joins non-deleted docs |
| Config | `config/app.config.ts`, `packages/domain/src/app-config.ts` | `AppConfig`; add `chunkingStrategy` + `reranking` |
| Constants | `config/constants.ts` | `TOOL_CONTENT_CAP=800`, `DEFAULT_SEARCH_LIMIT=3`, `SIMILARITY_THRESHOLD=0.5` |
| Prompt cap | `packages/application/src/prompt/build-system-prompt.ts:161` | prefetch truncated at 800 |
| Tool cap | `src/app/api/chat/route.ts:11` | tool content capped at 800 |
| Composition | `src/composition.ts` | wires splitter/embedding; no strategy selection |
| Seed | `packages/cli/src/commands/seed.ts:84` | hand-built adapter uses `searchByVector` + old `insertMany` shape |
| Tests | `rag/__tests__/search.test.ts`, `rag/__tests__/ingest.integration.test.ts` | mocks `searchByVector` + `splitText` |
| Validation | `package.json` scripts; `.github/workflows/ci.yml` | typecheck, lint, test, build; `arch` separate |

---

## 3. To-be architecture (target)

```
PDF
 └─ PdfParser.extractDocument (per-page, ONE call) → ParsedDocument { text, pages }
     └─ SmartTextSplitter.splitDocument(doc, {docTitle, embeddings})
         → chunks: [{ content, embedding?, metadata:{ page, chunkIndex, section } }]
             ├─ EmbeddingService.embedBatch (skipped if chunk.embedding precomputed)
             └─ fts = to_tsvector('simple', content)   (GENERATED column, auto)
         → chunks row: { documentId, content, embedding, page, chunkIndex, section, meta, fts }
                                      │
Query ──► embed ──► vector top-N (bounded, uses HNSW) ─┐
        └─► FTS top-N (bounded) ──────────────────────┤─► RRF fuse (single SQL CTE, returns id+docTitle)
                                                     │                    │
                                                     │              Reranker port (default: rrf / local)
                                                     │              OR: Cohere/Gemini API reranker (config switch)
                                                     │                    │
                                                     └───────────────────► top-K returned to model
```

---

## 4. Chunking strategy registry (plugin pattern)

**Contract:** `SmartTextSplitter` consumes a `ParsedDocument` (not the raw `Buffer`) — preserves parser/splitter separation, keeps strategies unit-testable, matches `IngestDeps`.

### 4.1 Single source of truth for the strategy enum
Define the canonical tuple in **domain** (so both the zod config and the infra registry derive from it — no drift):
```ts
// packages/domain/src/ports.ts
export const CHUNKING_STRATEGIES = ['document-aware', 'recursive-adaptive', 'semantic'] as const;
export type ChunkingStrategy = (typeof CHUNKING_STRATEGIES)[number];
```
```ts
// packages/domain/src/app-config.ts
chunkingStrategy: z.enum(CHUNKING_STRATEGIES).default('document-aware'),
```

### 4.2 Registry
**New file:** `packages/infrastructure/src/pdf/strategies/index.ts`
```ts
import type { SmartTextSplitter, ChunkingStrategy } from '@app/domain';

export function getChunkingStrategy(
  name: ChunkingStrategy,
  deps: { embeddings: EmbeddingService },
): SmartTextSplitter {
  switch (name) {
    case 'document-aware':     return documentAwareSplitter;
    case 'recursive-adaptive': return adaptiveRecursiveSplitter;
    case 'semantic':           return makeSemanticSplitter(deps.embeddings); // closes over EmbeddingService
    default: throw new Error(`Unknown chunking strategy: "${name}"`);
  }
}
export { documentAwareSplitter } from './document-aware';
export { adaptiveRecursiveSplitter } from './recursive-adaptive';
export { makeSemanticSplitter } from './semantic';
```
**Adding a strategy = 1 file + 1 tuple member + 1 import + 1 case.** Nothing else changes.

### 4.3 Strategy implementations

| File | Strategy | Default? | Behavior |
|------|----------|----------|----------|
| `strategies/document-aware.ts` | `document-aware` | ✅ | Per-page; infer headings (ALL-CAPS / `:` / `#` / much-shorter) as **best-effort**; group under heading; split long (>800) at sentence boundaries w/ ~100 overlap; merge tiny (<50) into next. Carries `page` + `section`. |
| `strategies/recursive-adaptive.ts` | `recursive-adaptive` | | Split by paragraph; merge <200 into next; chunk >800 via `RecursiveCharacterTextSplitter(800,100)`. Range ~200–800. No page/section. |
| `strategies/semantic.ts` | `semantic` | | `makeSemanticSplitter(embeddings)` embeds sentences via `embeddings.embedBatch` **once**, splits where cosine < 0.3, target 300–600. **Reuses sentence embeddings to mean-pool final chunk embeddings** (returned on `SplitChunk.embedding`) so tokens are embedded once, not twice. Opt-in only. |

**Heading detection caveat:** `unpdf` plain text has no bold/size signal; `section` is best-effort and affects **citation labels only** (it is not embedded nor FTS-indexed). Store the raw heading in `meta` for machine use.

### 4.4 Per-page extraction (corrected unpdf shape)
`extractText(pdf, {mergePages:false})` returns `{ totalPages: number; text: string[] }` — **not** `{text, pages}`. Correct implementation:
```ts
export const unpdfParser: PdfParser = {
  async extractText(buffer) { /* existing mergePages:true — keep for back-compat/scripts */ },
  async extractDocument(buffer: Buffer): Promise<ParsedDocument> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { useSystemFonts: true });
    const { text: pageTexts, totalPages } = await extractText(pdf, { mergePages: false }); // ONE call
    const pages = (pageTexts?.length === totalPages)
      ? pageTexts
      : Array.from({ length: totalPages }, (_, i) => pageTexts?.[i] ?? '');
    return {
      text: pages.join('\n\n'),
      pages: pages.map((p, i) => ({ page: i + 1, text: p })),
    };
  },
};
```

---

## 5. Re-ranking strategy (explicit requirement)

**Config switch (user-facing):** `AppConfig.reranking = { strategy: 'rrf'|'cohere'|'gemini', rerankTopK?: number }` (default `rrf`). Env: `RERANKER_STRATEGY`, `COHERE_API_KEY`, `GEMINI_API_KEY` (reuse `AI_STUDIO_KEY`), `RERANKER_MODEL`. Missing key for `cohere`/`gemini` → **factory falls back to `rrf` + warns** (never hard-fail).

**Port (domain):**
```ts
export interface RerankCandidate { id: string; content: string }
export interface Reranker {
  rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<string[]>; // ordered ids
}
```
**Mapping (in `search.ts`):** build `candidates = chunks.map(c => ({ id: String(c.id), content: c.content }))`; after rerank, `byId = new Map(chunks.map(c => [c.id, c]))`; return `ids.map(id => byId.get(Number(id))).filter(Boolean)`. Filter **unmatched** ids. After an external rerank the `similarity` field still carries the RRF score (relabeled, not a reranker score) — acceptable for ranking; do not treat it as a confidence threshold.

---

## 6. Detailed changes (implementation order)

### Step 1 — Domain ports & types (`ports.ts`, `app-config.ts`)

**`PdfParser`** (ports.ts):
```ts
export interface ParsedPage { page: number; text: string }
export interface ParsedDocument { text: string; pages: ParsedPage[] }
export interface PdfParser {
  extractText(buffer: Buffer): Promise<string>;            // keep
  extractDocument(buffer: Buffer): Promise<ParsedDocument>; // new
}
```

**`SmartTextSplitter`** (replaces `TextSplitter`):
```ts
export interface ChunkMeta { page?: number; chunkIndex: number; section?: string; docTitle?: string }
export interface SplitChunk { content: string; embedding?: number[]; metadata: ChunkMeta }
export interface SmartTextSplitter {
  splitDocument(doc: ParsedDocument, opts: { docTitle?: string; embeddings: EmbeddingService }): Promise<SplitChunk[]>;
}
```

**`ChunkRepository`** (ports.ts) — `RetrievedChunk` defined **once here** (imported by `search.ts`); `docTitle` via JOIN (no column); `meta` included:
```ts
export interface RetrievedChunk {
  id: number;               // REQUIRED for RRF fusion + parent lookups
  content: string;
  similarity: number;       // RRF fused score (NOT cosine; do not compare to 0.5)
  page?: number | null;
  chunkIndex?: number | null;
  section?: string | null;
  docTitle?: string | null; // joined from documents.file_name
  meta?: Record<string, unknown> | null;
}
export interface ChunkRepository {
  searchHybrid(
    queryEmbedding: number[],
    queryText: string,
    opts: { limit: number; retrieveK: number; vecK: number; ftsK: number },
  ): Promise<RetrievedChunk[]>;
  insertMany(rows: Array<{
    documentId: number; content: string; embedding: number[];
    page?: number | null; chunkIndex: number;
    section?: string | null; meta?: Record<string, unknown> | null;
  }>): Promise<void>;
  deleteByDocumentId(documentId: number): Promise<void>;
  // count* helpers unchanged
  searchByVector?: (...) => Promise<RetrievedChunk[]>; // optional pure-vector fallback
}
```

**`AppConfig`** (`app-config.ts`): add `chunkingStrategy` (§4.1) + `reranking` (§5).

**`config/constants.ts`:**
- `TOOL_CONTENT_CAP` 800 → 1100 (≥ largest chunk any strategy emits).
- Add `RETRIEVE_K = 20`, `VEC_K = 20`, `FTS_K = 20`, `RRF_K = 60`, `RRF_WEIGHT_VECTOR = 0.6`, `RRF_WEIGHT_FTS = 0.4`.
- `SIMILARITY_THRESHOLD = 0.5` → **keep ONLY for the pure-vector fallback path**; the hybrid path does NOT apply a cosine threshold (RRF scores are ~0.01–0.016). Add `RRF_FLOOR = 1e-4` if any floor is desired.
- `DEFAULT_SEARCH_LIMIT = 3`.

### Step 2 — DB schema migration (`schema.ts`, `drizzle/`)

`chunks` table → add:
```ts
page: integer('page'),
chunkIndex: integer('chunk_index').notNull().default(0),
section: text('section'),
meta: jsonb('meta'),
fts: tsvector('fts')   // GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
```
- **Declare the generation expression explicitly:** drizzle must use `.generatedAlwaysAs(sql`to_tsvector('simple', content)`, { mode: 'stored' })` — without it, `fts` ships as an empty plain column and hybrid silently degrades to vector-only.
- Indexes: keep `chunks_document_id_idx`; add `chunks_page_idx`; GIN index built **`CONCURRENTLY`** in a follow-up step run **outside** a transaction (lock risk on a populated table).

Generate: `pnpm db:generate` → `drizzle/0004_*.sql`. Migration includes:
- `ALTER TABLE chunks ADD COLUMN …;` (nullable/defaulted → non-breaking for metadata)
- `ALTER TABLE chunks ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;` (Postgres backfills existing rows)
- `CREATE INDEX CONCURRENTLY chunks_fts_idx ON chunks USING gin(fts);` (separate, non-transactional)

### Step 3 — Infrastructure implementations

**`unpdf-parser.ts`** → `extractDocument` as §4.4.

**`strategies/*.ts`** → §4.3. `semantic` uses `opts.embeddings.embedBatch(sentences)` **once**, then **mean-pools sentence vectors into per-chunk vectors** and returns them on `SplitChunk.embedding` so `ingest` skips re-embedding.

**`repositories.ts`** `searchChunksByVector` → **`searchHybrid` (single SQL CTE, BOUNDED candidates so HNSW is used, returns `id` + `docTitle`):**
```sql
WITH vec AS (
  SELECT id, row_number() OVER (ORDER BY dist) AS rnk FROM (
    SELECT c.id, (c.embedding <=> :vec::vector) AS dist
    FROM chunks c JOIN documents d ON d.id = c.document_id
    WHERE d.deleted_at IS NULL
    ORDER BY dist LIMIT :vecK
  ) sub
),
fts AS (
  SELECT c.id,
         row_number() OVER (ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('simple', :q)) DESC) AS rnk
  FROM chunks c JOIN documents d ON d.id = c.document_id
  WHERE d.deleted_at IS NULL
    AND c.fts @@ websearch_to_tsquery('simple', :q)
  ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('simple', :q)) DESC
  LIMIT :ftsK
),
fused AS (
  SELECT COALESCE(v.id, f.id) AS id,
         :wv * COALESCE(1.0 / (:k + v.rnk), 0) + :wf * COALESCE(1.0 / (:k + f.rnk), 0) AS score
  FROM vec v FULL OUTER JOIN fts f ON v.id = f.id
)
SELECT c.id, c.content, d.file_name AS "docTitle", c.page, c.chunk_index, c.section, c.meta,
       fused.score AS similarity
FROM fused JOIN chunks c ON c.id = fused.id
JOIN documents d ON d.id = c.document_id
ORDER BY fused.score DESC
LIMIT :retrieveK;
```
- No `WHERE score > threshold` (would delete all rows). `LIMIT :retrieveK` bounds output.
- `websearch_to_tsquery('simple', :q)` is more robust to natural-language queries than `plainto_tsquery` (which ANDs stopwords and kills recall). Keep lexeme `'simple'` for exact product/API terms.
- `insertChunks` → set `page, chunkIndex, section, meta`; **do not** pass `fts` (generated). Keep `embedding.length === VECTOR_DIM` check.

**New `packages/infrastructure/src/llm/rerank/`:**
- `rrf-reranker.ts` → pass-through (returns candidate ids in fused order).
- `cohere-reranker.ts` → Cohere `rerank` (`COHERE_API_KEY` + `RERANKER_MODEL`).
- `gemini-reranker.ts` → Gemini rerank (reuse `AI_STUDIO_KEY`; LLM-score fallback if no endpoint).
- All wrap in try/catch → on failure return RRF order (safe fallback).

### Step 4 — Application layer

**`ingest.ts` (`parseAndEmbed`):** call `pdfParser.extractDocument` → `textSplitter.splitDocument(doc, {docTitle: fileName, embeddings})` → map `SplitChunk[]` to rows (`page, chunkIndex, section, meta`). If `chunk.embedding` is present (semantic), **reuse it** and skip `embeddings.embedBatch` for those; otherwise embed `texts`. `ingestFile`/`prepareIngest` unchanged otherwise.

**`search.ts` (`searchChunks`):** import `RetrievedChunk` from domain. Accept `deps: SearchDeps & { reranker: Reranker; retrieveK: number; vecK: number; ftsK: number }`. Embed once; `chunks.searchHybrid(embedding, query, {limit, retrieveK, vecK, ftsK})`; build `RerankCandidate[]` (`id: String`), call `reranker.rerank(query, candidates, limit)`, map back via `Map` (filter unmatched). Keep blank-query short-circuit + `ExternalServiceError` mapping.

**Update ALL consumers of changed signatures (not just tests):**
- `packages/cli/src/commands/seed.ts:84` — uses `searchByVector` + old `insertMany` shape → update to `searchHybrid` + metadata `insertMany`.
- `packages/infrastructure/src/db/repositories.ts:473` `createChunkRepo` — wire `searchHybrid`.
- `packages/application/src/rag/search.ts:39` — reference `searchHybrid`, not `searchByVector`.

### Step 5 — Composition / factory wiring (`src/composition.ts`)

- `const splitter = getChunkingStrategy(appConfig.chunkingStrategy, { embeddings: embeddingService });` → inject into `IngestDeps.textSplitter`.
- `const reranker = getReranker(appConfig.reranking.strategy, env);` (infra factory; fallback `rrf`). **Application (`search.ts`) must reference only the `Reranker` port type**, never the infra factory (arch rule `no-application-importing-infrastructure`).
- `searchChunks` composition entry passes `reranker` + `retrieveK/vecK/ftsK`.
- `route.ts` `comp.searchChunks(query,{limit})` signature unchanged; citations now include `page`/`section`/`docTitle`.

### Step 6 — Prompt / citation formatting

- `build-system-prompt.ts:156` `buildPrefetchBlock` + `route.ts` `emitCitations` → citation string: `"> \"file.pdf p.12 (Section: Billing): ≤150 char snippet\""`.
- Prefetch cap (`:161`) → import `TOOL_CONTENT_CAP` (1100). Update the tool description string in `route.ts:36` (hardcodes 800) to match.
- **Decouple "open ticket" logic from the 0.5 cosine threshold** (`build-system-prompt.ts:39,61`, `route.ts`): under RRF, `similarity` is ~0.01–0.016, so "open ticket if top similarity < 0.5" would *always* fire. Replace with a rerank/confidence heuristic or a low `RRF_FLOOR`, not the old cosine threshold.

### Step 7 — Admin UI + re-ingest (atomic + force-able)

**`src/app/(app)/admin/settings/page.tsx`** (new): dropdown bound to `appConfig.chunkingStrategy` + warning that changing it requires re-ingest, with a "Re-ingest all" button.

**`src/app/api/admin/reingest/route.ts`** (new): POST → list non-deleted docs → for each: call a **`force` re-ingest** that **bypasses the `fileHash` short-circuit** (`ingest.ts` lines 74–77) and performs chunk replacement **inside `Db.transactionRunner`** so a failed insert rolls back to the prior chunks (honors "no doc left without chunks"). Enqueue as QStash jobs (parallel, retry). Returns summary. **Go through composition — do NOT import db/unpdf/drizzle directly** (arch rules).

**`ingest.ts` change:** add `force?: boolean` to `IngestFileInput`; when `force`, skip the `existing && fileHash === fileHash` early-return. Wrap `deleteByDocumentId` + `insertMany` in `deps.transaction` (or a `Db.transactionRunner`) so re-ingest is atomic.

---

## 7. Tests to update / add

- `search.test.ts`: rename mock `searchByVector` → `searchHybrid`; assert returned rows include `id` **and** `docTitle`. Add: blank query short-circuits; **RRF returns non-empty results under default settings** (regression for the old 0.5-threshold bug); reranker reorders (mock `Reranker`); API reranker **falls back to RRF** when key missing.
- `ingest.integration.test.ts`: `pdfParser.extractText` mock → `extractDocument` returning `{text, pages}`; `textSplitter.splitText` → `splitDocument` returning `SplitChunk[]`; assert `insertMany` called with `page, chunkIndex, section, meta`.
- `packages/infrastructure/src/llm/rerank/__tests__/rerank.test.ts`: RRF ordering; Cohere mock (no net); Gemini mock; fallback-to-RRF; unmatched-id filtering.
- `strategies/__tests__/*.test.ts`: each strategy returns `SplitChunk[]` with monotonic `chunkIndex`; `extractDocument` page alignment + empty-page guard (§4.4); `semantic` reuses sentence embeddings (no double embed); `force` re-ingest re-chunks a same-hash file; **re-ingest idempotency / failure restores old chunks** (transaction rollback).
- Update `packages/cli/src/commands/seed.ts` path to new signatures (covered in Step 4).
- Keep `domain` free of npm/infra imports (arch rule). Ports in domain; impls in infrastructure.
- **Arch hardening (recommend, optional):** add `@langchain/textsplitters` to `no-domain-importing-banned-packages` in `.dependency-cruiser.cjs` for symmetry (strategy files must stay under `infrastructure`).

---

## 8. Validation commands (run all — required before merge)

```bash
pnpm typecheck          # tsc --noEmit  (whole workspace)
pnpm lint               # eslint
pnpm test               # vitest run  (unit + integration)
pnpm arch               # dependency-cruiser --config .dependency-cruiser.cjs packages src
pnpm build              # tsx scripts/migrate.ts && next build
```

Notes:
- `pnpm test` = fast unit suite. Integration DB suite = `pnpm test:ci` (needs `pnpm setup-test-db` / `teardown-test-db`). Run `test:ci` before merge if a DB is available.
- `arch` is **not** in CI today (`ci.yml` runs typecheck→lint→test→build`). Promote `arch` to a CI step (add between Lint and Tests) so arch drift is caught.
- `build` runs `scripts/migrate.ts`, applying `0004_*.sql`. The GIN index `CREATE INDEX CONCURRENTLY` must run **outside** the transactional migrate (split into a follow-up non-transactional step).
- Env: `AI_STUDIO_KEY`, `DATABASE_URL`, Clerk keys needed for `build`. For `cohere`/`gemini` reranker, also `COHERE_API_KEY`/`AI_STUDIO_KEY`; absence must not break the `rrf` default.

---

## 9. Rollout / migration / risks

- **Migration is additive** (nullable/defaulted metadata cols + generated FTS col + indexes). Safe for metadata, but the `fts` STORED generated column **rewrites the table** (lock/backfill cost) — schedule in a low-traffic window; build GIN `CONCURRENTLY` outside a txn.
- **Re-ingest existing docs** (admin UI or `scripts/seed-docs.ts`) so old 350-char chunks gain page/section + correct sizing. Re-ingest is **`force`-able + atomic** (no doc left without chunks).
- **Chunk-count change** alters retrieval; note in PR; re-run `search.test.ts` expectations.
- **FTS lexeme `'simple'`** + `websearch_to_tsquery` for NL robustness; revisit only if stemming desired.
- **RRF weights** `0.6/0.4` + `RRF_K=60` are constants (parameterized in SQL).
- **Cost guard:** API reranker on ≤`rerankTopK` (20) candidates; try/catch → RRF fallback. `semantic` embeds once (mean-pool) — opt-in, surfaced in UI.
- **arch rule compliance:** ports in domain; network impls in infrastructure; `search.ts` references only port types.

---

## 10. Open decisions (resolve at implementation time)

1. FTS: **`'simple'` + `websearch_to_tsquery`** (recommended) vs custom TS config with English stopwords but unstemmed product terms.
2. RRF weights: **`0.6/0.4`** (recommended) vs tunable.
3. `document-aware` target size: **~800** (recommended) vs 1100 — keep `TOOL_CONTENT_CAP ≥` largest chunk.
4. Gemini rerank: official endpoint vs LLM-score fallback.
5. Promote `pnpm arch` into CI (recommended yes).
6. Whether `recursive-adaptive` / `semantic` ship in v1 or later as registry extensions.
7. `RRF_FLOOR` value (or none) for any optional hybrid floor.

---

## 11. Execution checklist (ticket breakdown)

- [x] Step 1: domain ports (`CHUNKING_STRATEGIES` tuple, `ParsedDocument`, `SmartTextSplitter` w/ `embeddings` opts, `RetrievedChunk` once, `Reranker`) + `AppConfig.chunkingStrategy` + `AppConfig.reranking`
- [x] Step 2: schema migration (metadata + generated FTS w/ explicit expr + indexes) + `CONCURRENTLY` GIN in separate non-txn step + generate `0004_*.sql`
- [x] Step 3a: `unpdf` `extractDocument` (correct shape + empty-page guard)
- [x] Step 3b: `strategies/index.ts` registry (factory w/ embeddings) + 3 strategy files
- [x] Step 3c: `searchHybrid` single-SQL RRF CTE (bounded vecK/ftsK, returns id+docTitle, no threshold filter)
- [x] Step 3d: `insertChunks` metadata (no manual fts)
- [x] Step 3e: `rerank/` (rrf, cohere, gemini) + id mapping + fallback
- [x] Step 4: `ingest.ts` (extractDocument + splitDocument + reuse chunk.embedding) + `search.ts` (domain `RetrievedChunk`, reranker wiring) + **update consumers** (`seed.ts`, `createChunkRepo`, `search.ts` internals)
- [x] Step 5: composition factory (splitter + reranker selection + fallback; port-only imports in app)
- [x] Step 6: citation formatting + `TOOL_CONTENT_CAP` import + decouple "open ticket" from cosine 0.5
- [x] Step 7: admin settings page + re-ingest endpoint (atomic + `force`)
- [x] Step 7 (tests): add reingest idempotency, RRF non-empty, extractDocument alignment, force reingest, semantic pool
- [ ] Step 8 (recommended, not yet in CI): CI `arch` step; arch banned-package hardening — *recommended but not wired into CI yet (no `.github/workflows/ci.yml` present); `pnpm arch` passes locally and is documented as a recommended CI gate in README.*
- [x] Run all validation: `pnpm typecheck && pnpm lint && pnpm test && pnpm arch && pnpm build`

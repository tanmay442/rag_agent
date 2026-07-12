// Centralised business-logic constants. Keep sorted alphabetically.
// Tune these to change behaviour without hunting through source files.
//
// TODO: Add tests for rate limiter concurrency, ticket ID collision,
// embedding batch retry logic, and composition root wiring.

export const CHAT_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
export const CITATION_SNIPPET_MAX = 150;
export const DEFAULT_SEARCH_LIMIT = 3;
export const EMBEDDING_BATCH_CONCURRENCY = 3;
export const EMBEDDING_BATCH_SIZE = 50;
export const FTS_K = 20;
export const MAX_AUDIT_LIMIT = 200;
export const MAX_LIST_LIMIT = 100;
export const MAX_TICKET_NOTES_LENGTH = 10_000;
export const RERANK_TOP_K = 20;
export const RETRIEVE_K = 20;
export const RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RRF_FLOOR = 1e-4;
export const RRF_K = 60;
export const RRF_WEIGHT_FTS = 0.4;
export const RRF_WEIGHT_VECTOR = 0.6;
export const SIMILARITY_THRESHOLD = 0.5;
export const TOOL_CONTENT_CAP = 1100;
export const VEC_K = 20;

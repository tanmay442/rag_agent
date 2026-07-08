import { Schema } from 'effect';

// ---- Entity IDs ----

/** Unique identifier for a document row. */
export const DocumentId = Schema.Number.pipe(Schema.brand('DocumentId'));
export type DocumentId = typeof DocumentId.Type;

/** Unique identifier for a ticket (e.g., 'TKT-abcd1234'). */
export const TicketId = Schema.String.pipe(Schema.brand('TicketId'));
export type TicketId = typeof TicketId.Type;

/** Clerk user ID (e.g., 'user_abc123'). */
export const ClerkUserId = Schema.String.pipe(Schema.brand('ClerkUserId'));
export type ClerkUserId = typeof ClerkUserId.Type;

/** Object storage key (e.g., 'docs/42/invoice.pdf'). */
export const StorageKey = Schema.String.pipe(Schema.brand('StorageKey'));
export type StorageKey = typeof StorageKey.Type;

// ---- Scalar IDs (for embedding dimensions, chunk indices, etc.) ----

/** Embedding dimension count. */
export const EmbeddingDimension = Schema.Number.pipe(
  Schema.brand('EmbeddingDimension'),
);
export type EmbeddingDimension = typeof EmbeddingDimension.Type;

/** Chunk index within a document (0-based). */
export const ChunkIndex = Schema.Number.pipe(Schema.brand('ChunkIndex'));
export type ChunkIndex = typeof ChunkIndex.Type;

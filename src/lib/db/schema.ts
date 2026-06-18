import {
  pgTable,
  serial,
  text,
  timestamp,
  customType,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// pgvector type. Used for 768-dim embeddings from Google's text-embedding-004.
// Driver values are the raw pgvector string format ('[0.1,0.2,...]'); the
// application code converts to/from `number[]` at the boundary.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value === 'string') {
      return value
        .slice(1, -1)
        .split(',')
        .map((n) => Number(n));
    }
    return value as unknown as number[];
  },
});

// 1. Documents metadata — one row per uploaded file.
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull().unique(),
  fileHash: text('file_hash').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

// 2. Document chunks — vector store. HNSW index for cosine similarity.
export const chunks = pgTable(
  'chunks',
  {
    id: serial('id').primaryKey(),
    documentId: serial('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding').notNull(),
  },
  (table) => [
    index('embedding_idx')
      .using('hnsw', sql`${table.embedding} vector_cosine_ops`),
  ],
);

// 3. Support tickets — created via the createSupportTicket tool.
export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  ticketId: text('ticket_id').notNull().unique(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  issue: text('issue').notNull(),
  status: text('status').notNull().default('created'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

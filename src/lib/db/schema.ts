import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  customType,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from './schema-vector';

// 1. Documents metadata — one row per uploaded file.
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull().unique(),
  fileHash: text('file_hash').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  // Raw PDF bytes for inline preview. Null on legacy rows (pre-this-change);
  // the admin UI shows a "Preview unavailable" placeholder when null.
  blob: customType<{ data: Buffer | null; driverData: Buffer | null }>({
    dataType() {
      return 'bytea';
    },
    toDriver(value: Buffer | null): Buffer | null {
      return value;
    },
    fromDriver(value: unknown): Buffer | null {
      if (value == null) return null;
      if (Buffer.isBuffer(value)) return value;
      return Buffer.from(value as ArrayBuffer);
    },
  })('blob'),
  // Soft-delete timestamp. `null` means the document is live. Hard delete
  // also drops the row (and cascades chunks); restore is only possible
  // within 7 days of soft-delete.
  deletedAt: timestamp('deleted_at'),
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
  // Optional admin metadata. `assignedTo` is a Clerk user id; `notes` is
  // a single rolling markdown thread.
  assignedTo: text('assigned_to'),
  notes: text('notes'),
});

// 4. Users — mirror of Clerk users for fast lookups (role, last seen, etc.).
// Clerk remains the source of truth; this row is a cache.
export const users = pgTable(
  'users',
  {
    clerkUserId: text('clerk_user_id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    imageUrl: text('image_url'),
    role: text('role').notNull().default('user'),
    lastSeenAt: timestamp('last_seen_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check('users_role_check', sql`${table.role} IN ('admin','user')`),
  ],
);

// 5. Document audit log — one row per admin action on a document.
export const documentAudit = pgTable(
  'document_audit',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    at: timestamp('at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'document_audit_action_check',
      sql`${table.action} IN ('upload','replace','delete','restore')`,
    ),
  ],
);

// 6. Ticket audit log — one row per admin action on a ticket, plus
// impersonation events from the admin user list.
export const ticketAudit = pgTable(
  'ticket_audit',
  {
    id: serial('id').primaryKey(),
    ticketId: text('ticket_id').references(() => tickets.ticketId, {
      onDelete: 'set null',
    }),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    at: timestamp('at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'ticket_audit_action_check',
      sql`${table.action} IN ('create','assign','status_change','note','impersonation')`,
    ),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type DocumentAudit = typeof documentAudit.$inferSelect;
export type NewDocumentAudit = typeof documentAudit.$inferInsert;
export type TicketAudit = typeof ticketAudit.$inferSelect;
export type NewTicketAudit = typeof ticketAudit.$inferInsert;

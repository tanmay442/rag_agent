// Drizzle table definitions. Source of truth for the
// documents, chunks, tickets, users, document_audit, and
// ticket_audit tables. The bytea customType for the
// documents.blob column lives in storage/bytea-blob.ts.
import {
  pgTable, serial, text, timestamp, integer,
  index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createVectorType } from './schema-vector';
import { byteaBlob } from '../storage/bytea-blob';

const vector = createVectorType(768);

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull().unique(),
  fileHash: text('file_hash').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  blob: byteaBlob('blob'),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('documents_deleted_at_idx').on(table.deletedAt),
  index('documents_uploaded_at_idx').on(table.uploadedAt.desc()),
]);

export const chunks = pgTable('chunks', {
  id: serial('id').primaryKey(),
  documentId: serial('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding').notNull(),
}, (table) => [
  index('embedding_idx').using('hnsw', sql`${table.embedding} vector_cosine_ops`),
  index('chunks_document_id_idx').on(table.documentId),
]);

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  ticketId: text('ticket_id').notNull().unique(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  issue: text('issue').notNull(),
  status: text('status').notNull().default('created'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  assignedTo: text('assigned_to'),
  notes: text('notes'),
}, (table) => [
  index('tickets_status_idx').on(table.status),
]);

export const users = pgTable('users', {
  clerkUserId: text('clerk_user_id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  imageUrl: text('image_url'),
  role: text('role').notNull().default('user'),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  check('users_role_check', sql`${table.role} IN ('admin','user')`),
]);

export const documentAudit = pgTable('document_audit', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').references(() => documents.id, { onDelete: 'set null' }),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  at: timestamp('at').defaultNow().notNull(),
}, (table) => [
  check('document_audit_action_check', sql`${table.action} IN ('upload','replace','delete','restore')`),
]);

export const ticketAudit = pgTable('ticket_audit', {
  id: serial('id').primaryKey(),
  ticketId: text('ticket_id').references(() => tickets.ticketId, { onDelete: 'set null' }),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  at: timestamp('at').defaultNow().notNull(),
}, (table) => [
  check('ticket_audit_action_check', sql`${table.action} IN ('create','assign','status_change','note','impersonation')`),
]);

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

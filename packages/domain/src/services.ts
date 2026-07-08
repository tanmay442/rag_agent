/* eslint-disable @typescript-eslint/no-namespace */
// Effect service definitions — replaces the former `ports.ts`.
//
// Every port is a `Context.Tag`-based service. Implementations are
// provided at the composition root via `Layer`s; use-cases retrieve
// them with `const svc = yield* ServiceName` inside `Effect.gen`.
//
// Discriminate errors on `_tag` (see errors.ts), not `instanceof`.
import { Context, Effect } from 'effect';
import type {
  ExternalServiceError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from './errors';

/** Lifecycle status of a document's ingest pipeline. */
export type IngestStatus = 'queued' | 'ingesting' | 'done' | 'failed';

export interface DocumentRow {
  id: number;
  fileName: string;
  fileHash: string;
  uploadedBy: string;
  uploadedAt: Date;
  storageKey: string | null;
  ingestStatus: IngestStatus;
  deletedAt: Date | null;
}

export interface TicketRow {
  id: number;
  ticketId: string;
  userId: string;
  name: string;
  email: string;
  issue: string;
  status: 'created' | 'in_progress' | 'closed';
  createdAt: Date;
  assignedTo: string | null;
  notes: string | null;
}

export interface UserRow {
  clerkUserId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: 'admin' | 'user';
  lastSeenAt: Date | null;
  createdAt: Date;
}

export type DocumentAuditAction = 'upload' | 'replace' | 'delete' | 'restore';
export type TicketAuditAction =
  | 'create'
  | 'assign'
  | 'status_change'
  | 'note'
  | 'role_change';

export interface AuditEvent {
  id: number;
  kind: 'document' | 'ticket';
  documentId: number | null;
  ticketId: string | null;
  actorId: string;
  actorName: string | null;
  action: string;
  at: Date;
}

export interface ListDocumentsOpts {
  search?: string;
  includeDeleted?: boolean;
  limit: number;
  offset: number;
}

export interface ListDocumentsResult {
  documents: Array<DocumentRow & { hasBlob: boolean }>;
  total: number;
}

export interface InsertDocumentInput {
  fileName: string;
  fileHash: string;
  uploadedBy: string;
}

export interface InsertTicketInput {
  ticketId: string;
  userId: string;
  name: string;
  email: string;
  issue: string;
}

export interface UpsertUserInput {
  clerkUserId: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  role: 'admin' | 'user';
}

export interface ListAuditOpts {
  documentId?: number;
  ticketId?: string;
  limit: number;
  offset: number;
}

export interface ListAuditResult {
  events: AuditEvent[];
  total: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  imageUrl: string | null;
  role: 'admin' | 'user';
}

// ---- Documents ----

export class Documents extends Context.Tag('@app/Documents')<Documents, Documents.Service>() {}
export namespace Documents {
  export interface Service {
    readonly findByName: (fileName: string) => Effect.Effect<DocumentRow | null, ExternalServiceError>;
    readonly findById: (id: number) => Effect.Effect<DocumentRow | null, ExternalServiceError>;
    readonly setStorageKey: (id: number, key: string) => Effect.Effect<void, ExternalServiceError>;
    readonly updateIngestStatus: (id: number, status: IngestStatus) => Effect.Effect<void, ExternalServiceError>;
    readonly insert: (input: InsertDocumentInput) => Effect.Effect<DocumentRow, ExternalServiceError>;
    readonly deleteById: (id: number) => Effect.Effect<void, ExternalServiceError>;
    readonly softDelete: (id: number, at: Date) => Effect.Effect<DocumentRow | null, ExternalServiceError>;
    readonly restore: (id: number) => Effect.Effect<DocumentRow | null, ExternalServiceError>;
    readonly list: (opts: ListDocumentsOpts) => Effect.Effect<ListDocumentsResult, ExternalServiceError>;
    readonly countChunksForDocuments: (documentIds: number[]) => Effect.Effect<Map<number, number>, ExternalServiceError>;
    readonly countChunksForAll: () => Effect.Effect<number, ExternalServiceError>;
  }
}

// ---- Chunks ----

export interface ChunkSearchHit {
  content: string;
  similarity: number;
}

export interface InsertChunkRow {
  documentId: number;
  content: string;
  embedding: number[];
}

export class Chunks extends Context.Tag('@app/Chunks')<Chunks, Chunks.Service>() {}
export namespace Chunks {
  export interface Service {
    readonly searchByVector: (
      embedding: number[],
      opts: { threshold: number; limit: number },
    ) => Effect.Effect<ChunkSearchHit[], ExternalServiceError>;
    readonly insertMany: (rows: InsertChunkRow[]) => Effect.Effect<void, ExternalServiceError>;
    readonly countForDocuments: (documentIds: number[]) => Effect.Effect<Map<number, number>, ExternalServiceError>;
    readonly countForAll: () => Effect.Effect<number, ExternalServiceError>;
    readonly countForDocument: (documentId: number) => Effect.Effect<number, ExternalServiceError>;
    readonly recountAll: () => Effect.Effect<Array<{ documentId: number; count: number }>, ExternalServiceError>;
  }
}

// ---- Tickets ----

export interface ListTicketsOpts {
  status?: 'created' | 'in_progress' | 'closed';
  assignee?: string | null;
  search?: string;
  limit: number;
  offset: number;
}

export interface ListTicketsResult {
  rows: TicketRow[];
  total: number;
}

export class Tickets extends Context.Tag('@app/Tickets')<Tickets, Tickets.Service>() {}
export namespace Tickets {
  export interface Service {
    readonly findByTicketId: (ticketId: string) => Effect.Effect<TicketRow | null, ExternalServiceError>;
    readonly list: (opts: ListTicketsOpts) => Effect.Effect<ListTicketsResult, ExternalServiceError>;
    readonly latest: () => Effect.Effect<{ id: number; ticketId: string } | null, ExternalServiceError>;
    readonly insert: (input: InsertTicketInput) => Effect.Effect<TicketRow, ExternalServiceError>;
    readonly update: (
      ticketId: string,
      patch: Partial<Pick<TicketRow, 'status' | 'assignedTo' | 'notes'>>,
    ) => Effect.Effect<TicketRow | null, ExternalServiceError>;
    readonly countAll: () => Effect.Effect<number, ExternalServiceError>;
    readonly countOpen: () => Effect.Effect<number, ExternalServiceError>;
  }
}

// ---- Users ----

export interface ListUsersOpts {
  search?: string;
  limit: number;
  offset: number;
}

export interface ListUsersResult {
  rows: UserRow[];
  total: number;
}

export class Users extends Context.Tag('@app/Users')<Users, Users.Service>() {}
export namespace Users {
  export interface Service {
    readonly upsertFromClerk: (input: UpsertUserInput) => Effect.Effect<UserRow, ExternalServiceError>;
    readonly findByClerkId: (clerkUserId: string) => Effect.Effect<UserRow | null, ExternalServiceError>;
    readonly findByIds: (clerkUserIds: string[]) => Effect.Effect<UserRow[], ExternalServiceError>;
    readonly setRole: (clerkUserId: string, role: 'admin' | 'user') => Effect.Effect<UserRow | null, ExternalServiceError>;
    readonly touchLastSeen: (clerkUserId: string) => Effect.Effect<void, ExternalServiceError>;
    readonly list: (opts: ListUsersOpts) => Effect.Effect<ListUsersResult, ExternalServiceError>;
    readonly countAll: () => Effect.Effect<number, ExternalServiceError>;
    readonly syncClerkRole: (clerkUserId: string, role: 'admin' | 'user') => Effect.Effect<void, ExternalServiceError>;
  }
}

// ---- Audit ----

export class Audit extends Context.Tag('@app/Audit')<Audit, Audit.Service>() {}
export namespace Audit {
  export interface Service {
    readonly logDocumentEvent: (input: {
      action: DocumentAuditAction;
      documentId: number;
      actorId: string;
    }) => Effect.Effect<void, ExternalServiceError>;
    readonly logTicketEvent: (input: {
      action: TicketAuditAction;
      ticketId: string;
      actorId: string;
    }) => Effect.Effect<void, ExternalServiceError>;
    readonly list: (input: ListAuditOpts) => Effect.Effect<ListAuditResult, ExternalServiceError>;
  }
}

// ---- Rate limiting & query stats ----

export interface RateLimitOk {
  remaining: number;
  resetMs: number;
}

export class RateLimiter extends Context.Tag('@app/RateLimiter')<RateLimiter, RateLimiter.Service>() {}
export namespace RateLimiter {
  export interface Service {
    readonly check: (
      key: string,
      opts: { limit: number; windowMs: number },
    ) => Effect.Effect<RateLimitOk, RateLimitedError | ExternalServiceError>;
  }
}

export class QueryStats extends Context.Tag('@app/QueryStats')<QueryStats, QueryStats.Service>() {}
export namespace QueryStats {
  export interface Service {
    readonly record: (userId: string, query: string) => Effect.Effect<void, ExternalServiceError>;
    readonly top: (limit: number) => Effect.Effect<Array<{ q: string; count: number }>, ExternalServiceError>;
  }
}

// ---- Embeddings ----

export class Embeddings extends Context.Tag('@app/Embeddings')<Embeddings, Embeddings.Service>() {}
export namespace Embeddings {
  export interface Service {
    readonly embed: (value: string) => Effect.Effect<number[], ExternalServiceError>;
    readonly embedBatch: (values: string[]) => Effect.Effect<number[][], ExternalServiceError>;
  }
}

// ---- Blob storage ----

export class BlobStorage extends Context.Tag('@app/BlobStorage')<BlobStorage, BlobStorage.Service>() {}
export namespace BlobStorage {
  export interface Service {
    readonly put: (key: string, body: Buffer, contentType: string) => Effect.Effect<void, ExternalServiceError>;
    readonly get: (key: string) => Effect.Effect<Buffer, ExternalServiceError>;
    readonly stream: (key: string) => Effect.Effect<ReadableStream<Uint8Array>, ExternalServiceError>;
    readonly delete: (key: string) => Effect.Effect<void, ExternalServiceError>;
    readonly signedUrl: (key: string, ttlSec: number) => Effect.Effect<string, ExternalServiceError>;
  }
}

// ---- Async ingest queue ----

export class IngestQueue extends Context.Tag('@app/IngestQueue')<IngestQueue, IngestQueue.Service>() {}
export namespace IngestQueue {
  export interface Service {
    readonly enqueue: (payload: { documentId: number }) => Effect.Effect<void, ExternalServiceError>;
  }
}

// ---- PDF parsing & text splitting ----

export class PdfParser extends Context.Tag('@app/PdfParser')<PdfParser, PdfParser.Service>() {}
export namespace PdfParser {
  export interface Service {
    readonly extractText: (buffer: Buffer) => Effect.Effect<string, ExternalServiceError>;
  }
}

export class TextSplitter extends Context.Tag('@app/TextSplitter')<TextSplitter, TextSplitter.Service>() {}
export namespace TextSplitter {
  export interface Service {
    readonly splitText: (text: string) => Effect.Effect<string[], ExternalServiceError>;
  }
}

// ---- Transaction runner ----

/** Repositories scoped to an active DB transaction. Each is a
 *  service implementation whose operations participate in the tx. */
export interface TransactionContext {
  readonly documents: Documents.Service;
  readonly chunks: Chunks.Service;
  readonly audit: Audit.Service;
  readonly tickets: Tickets.Service;
  readonly users: Users.Service;
}

export class TransactionRunner extends Context.Tag('@app/TransactionRunner')<
  TransactionRunner,
  TransactionRunner.Service
>() {}
export namespace TransactionRunner {
  export interface Service {
    readonly run: <A, E, R>(
      fn: (ctx: TransactionContext) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ExternalServiceError, R>;
  }
}

// ---- Misc: Clock, Hasher, SessionStore ----

export class Clock extends Context.Tag('@app/Clock')<Clock, Clock.Service>() {}
export namespace Clock {
  export interface Service {
    readonly now: () => Effect.Effect<Date, never>;
  }
}

export class Hasher extends Context.Tag('@app/Hasher')<Hasher, Hasher.Service>() {}
export namespace Hasher {
  export interface Service {
    readonly sha256: (buf: Buffer) => Effect.Effect<string, never>;
  }
}

export interface Session {
  readonly user: SessionUser;
}

export class SessionStore extends Context.Tag('@app/SessionStore')<SessionStore, SessionStore.Service>() {}
export namespace SessionStore {
  export interface Service {
    readonly getSession: () => Effect.Effect<Session | null, ExternalServiceError>;
  }
}

// Re-export error types used in service signatures for convenience.
export type {
  ExternalServiceError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
};

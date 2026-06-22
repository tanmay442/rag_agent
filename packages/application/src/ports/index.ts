// Port interfaces — the boundary between the application layer
// and whatever infrastructure implementation provides the
// behaviour. Adapters in @app/infrastructure implement these;
// use-cases depend on these abstractions, not on drizzle /
// @ai-sdk / pdf-parse / clerk directly. This is the core of
// the Clean Architecture dependency rule: use-cases know
// nothing about HOW the work is done, only WHAT they need.

export interface DocumentRow {
  id: number;
  fileName: string;
  fileHash: string;
  uploadedBy: string;
  uploadedAt: Date;
  blob: Buffer | null;
  deletedAt: Date | null;
}

export interface ChunkRow {
  id: number;
  documentId: number;
  content: string;
  embedding: number[];
}

export interface TicketRow {
  id: number;
  ticketId: string;
  userId: string;
  name: string;
  email: string;
  issue: string;
  status: string;
  createdAt: Date;
  assignedTo: string | null;
  notes: string | null;
}

export interface UserRow {
  clerkUserId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

// ---- Documents & Chunks ----

export interface DocumentRepository {
  findByName(fileName: string): Promise<DocumentRow | null>;
  findById(id: number): Promise<DocumentRow | null>;
  saveBlob(id: number, blob: Buffer): Promise<void>;
  insert(input: { fileName: string; fileHash: string; uploadedBy: string }): Promise<DocumentRow>;
  deleteById(id: number): Promise<void>;
  softDelete(id: number, at: Date): Promise<DocumentRow | null>;
  restore(id: number): Promise<DocumentRow | null>;
  listDeletedSince(at: Date): Promise<Array<Pick<DocumentRow, 'id'>>>;
  updateBlob(id: number, blob: Buffer): Promise<void>;
  list(opts: {
    search?: string;
    includeDeleted?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ documents: DocumentRow[]; total: number }>;
  countChunksForDocuments(documentIds: number[]): Promise<Map<number, number>>;
  countChunksForAll(): Promise<number>;
}

export interface ChunkRepository {
  searchByVector(
    embedding: number[],
    opts: { threshold: number; limit: number },
  ): Promise<Array<{ content: string; similarity: number }>>;
  insertMany(rows: Array<{ documentId: number; content: string; embedding: number[] }>): Promise<void>;
  countForDocuments(documentIds: number[]): Promise<Map<number, number>>;
  countForAll(): Promise<number>;
  countForDocument(documentId: number): Promise<number>;
  recountAll(): Promise<Array<{ documentId: number; count: number }>>;
}

// ---- Tickets ----

export interface TicketRepository {
  findByTicketId(ticketId: string): Promise<TicketRow | null>;
  list(
    opts: {
      status?: string;
      assignee?: string | null;
      search?: string;
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: TicketRow[]; total: number }>;
  latest(): Promise<{ id: number; ticketId: string } | null>;
  insert(input: {
    ticketId: string;
    userId: string;
    name: string;
    email: string;
    issue: string;
  }): Promise<TicketRow>;
  update(
    ticketId: string,
    patch: Partial<Pick<TicketRow, 'status' | 'assignedTo' | 'notes'>>,
  ): Promise<TicketRow | null>;
  countAll(): Promise<number>;
  countOpen(): Promise<number>;
}

// ---- Users ----

export interface UserRepository {
  upsertFromClerk(input: {
    clerkUserId: string;
    email: string;
    name?: string | null;
    imageUrl?: string | null;
    role: 'admin' | 'user';
  }): Promise<UserRow>;
  findByClerkId(clerkUserId: string): Promise<UserRow | null>;
  setRole(clerkUserId: string, role: 'admin' | 'user'): Promise<UserRow | null>;
  touchLastSeen(clerkUserId: string): Promise<void>;
  list(opts: {
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: UserRow[]; total: number }>;
  countAll(): Promise<number>;
  syncClerkRole(clerkUserId: string, role: 'admin' | 'user'): Promise<void>;
}

// ---- Audit ----

export type DocumentAuditAction = 'upload' | 'replace' | 'delete' | 'restore';
export type TicketAuditAction =
  | 'create'
  | 'assign'
  | 'status_change'
  | 'note'
  | 'impersonation';

export interface AuditLog {
  logDocumentEvent(input: {
    action: DocumentAuditAction;
    documentId: number;
    actorId: string;
  }): Promise<void>;
  logTicketEvent(input: {
    action: TicketAuditAction;
    ticketId: string;
    actorId: string;
  }): Promise<void>;
  list(input: {
    documentId?: number;
    ticketId?: string;
    limit: number;
    offset: number;
  }): Promise<{
    events: Array<{
      id: number;
      kind: 'document' | 'ticket';
      documentId: number | null;
      ticketId: string | null;
      actorId: string;
      actorName: string | null;
      action: string;
      at: Date;
    }>;
    total: number;
  }>;
}

// ---- Rate Limiting & Query Stats ----

export interface RateLimiter {
  check(
    key: string,
    opts: { limit: number; windowMs: number },
  ): { ok: true; remaining: number; resetMs: number } | { ok: false; retryAfterMs: number };
}

export interface QueryStats {
  record(userId: string, query: string): void;
  top(limit: number): Array<{ q: string; count: number }>;
}

// ---- LLM / Embedding / Chat ----

export interface EmbeddingService {
  embed(value: string): Promise<number[]>;
  embedBatch(values: string[]): Promise<number[][]>;
}

export interface ChatService {
  /** Stream a UI message stream. Captures citations via onCitation. */
  stream(input: {
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    preFetched: Array<{ similarity: number; content: string }>;
    capturedCitations: Array<{ similarity: number; snippet: string }>;
  }): Promise<ReadableStream<Uint8Array>>;
}

// ---- PDF parsing & text splitting ----

export interface PdfParser {
  extractText(buffer: Buffer): Promise<string>;
}

export interface TextSplitter {
  splitText(text: string): Promise<string[]>;
}

// ---- Misc ----

export interface Clock {
  now(): Date;
}

export interface Hasher {
  sha256(buf: Buffer): string;
}

export interface SessionStore {
  /** Resolves the active session (or null when signed out). */
  getSession(): Promise<{
    user: { id: string; email: string; name: string; imageUrl: string | null; role: 'admin' | 'user' };
  } | null>;
}

/** Ingest lifecycle: `queued`→`ingesting`→`done`; `failed` is terminal despite QStash retry budget. */

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


export interface DocumentRepository {
  findByName(fileName: string, opts?: { includeDeleted?: boolean }): Promise<DocumentRow | null>;
  findById(id: number, opts?: { includeDeleted?: boolean }): Promise<DocumentRow | null>;
  setStorageKey(id: number, key: string): Promise<void>;
  updateIngestStatus(id: number, status: IngestStatus): Promise<void>;
  /** Atomically flip `queued`→`ingesting`; returns true iff this caller won the claim. */
  claimIngest(id: number): Promise<boolean>;
  insert(input: { fileName: string; fileHash: string; uploadedBy: string }): Promise<DocumentRow>;
  deleteById(id: number): Promise<void>;
  softDelete(id: number, at: Date): Promise<DocumentRow | null>;
  restore(id: number): Promise<DocumentRow | null>;
  list(opts: {
    search?: string;
    includeDeleted?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ documents: (DocumentRow & { hasBlob: boolean })[]; total: number }>;
  countChunksForDocuments(documentIds: number[]): Promise<Map<number, number>>;
  countChunksForAll(): Promise<number>;
}

export interface RetrievedChunk {
  id: number;
  content: string;
  similarity: number;
  page?: number | null;
  chunkIndex?: number | null;
  section?: string | null;
  docTitle?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface ChunkRepository {
  searchHybrid(
    queryEmbedding: number[],
    queryText: string,
    opts: { limit: number; retrieveK: number; vecK: number; ftsK: number },
  ): Promise<RetrievedChunk[]>;
  searchByVector?(
    embedding: number[],
    opts: { threshold: number; limit: number },
  ): Promise<Array<{ content: string; similarity: number }>>;
  insertMany(rows: Array<{
    documentId: number;
    content: string;
    embedding: number[];
    page?: number | null;
    chunkIndex: number;
    section?: string | null;
    meta?: Record<string, unknown> | null;
  }>): Promise<void>;
  deleteByDocumentId(documentId: number): Promise<void>;
  countForDocuments(documentIds: number[]): Promise<Map<number, number>>;
  countForAll(): Promise<number>;
  countForDocument(documentId: number): Promise<number>;
  recountAll(): Promise<Array<{ documentId: number; count: number }>>;
}

export interface RerankCandidate {
  id: string;
  content: string;
}

export interface Reranker {
  rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<string[]>;
}


export interface TicketRepository {
  findByTicketId(ticketId: string): Promise<TicketRow | null>;
  list(
    opts: {
      status?: 'created' | 'in_progress' | 'closed';
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


export interface UserRepository {
  upsertFromClerk(input: {
    clerkUserId: string;
    email: string;
    name?: string | null;
    imageUrl?: string | null;
    role: 'admin' | 'user';
  }): Promise<UserRow>;
  findByClerkId(clerkUserId: string): Promise<UserRow | null>;
  findByIds(clerkUserIds: string[]): Promise<UserRow[]>;
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


type DocumentAuditAction = 'upload' | 'replace' | 'delete' | 'restore';
type TicketAuditAction =
  | 'create'
  | 'assign'
  | 'status_change'
  | 'note'
  | 'impersonation'
  | 'role_change';

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
  /** Record a dedicated user/role audit entry (separate from the ticket trail). */
  logUserEvent(input: {
    targetUserId: string;
    actorId: string;
    fromRole: 'admin' | 'user';
    toRole: 'admin' | 'user';
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


export interface RateLimiter {
  check(
    key: string,
    opts: { limit: number; windowMs: number },
  ): Promise<{ ok: true; remaining: number; resetMs: number } | { ok: false; retryAfterMs: number }>;
}

export interface QueryStats {
  record(userId: string, query: string): Promise<void>;
  top(limit: number): Promise<Array<{ q: string; count: number }>>;
}


export interface EmbeddingService {
  embed(value: string): Promise<number[]>;
  embedBatch(values: string[]): Promise<number[][]>;
}


export interface BlobStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  signedUrl?(key: string, ttlSec: number): Promise<string>;
}


export interface IngestQueue {
  enqueue(payload: { documentId: number }): Promise<void>;
}


export const CHUNKING_STRATEGIES = ['document-aware', 'recursive-adaptive', 'semantic'] as const;
export type ChunkingStrategy = (typeof CHUNKING_STRATEGIES)[number];

export interface ParsedPage {
  page: number;
  text: string;
}

export interface ParsedDocument {
  text: string;
  pages: ParsedPage[];
}

export interface PdfParser {
  extractText(buffer: Buffer): Promise<string>;
  extractDocument(buffer: Buffer): Promise<ParsedDocument>;
}

export interface ChunkMeta {
  page?: number;
  chunkIndex: number;
  section?: string;
  docTitle?: string;
}

export interface SplitChunk {
  content: string;
  embedding?: number[];
  metadata: ChunkMeta;
}

export interface SmartTextSplitter {
  splitDocument(
    doc: ParsedDocument,
    opts: { docTitle?: string; embeddings: EmbeddingService },
  ): Promise<SplitChunk[]>;
}


export interface TransactionContext {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  audit: AuditLog;
  tickets: TicketRepository;
  users: UserRepository;
}

export interface TransactionRunner {
  run<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface Hasher {
  sha256(buf: Buffer): string;
}

export interface SessionStore {
  getSession(): Promise<{
    user: { id: string; email: string; name: string; imageUrl: string | null; role: 'admin' | 'user' };
  } | null>;
}

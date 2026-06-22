// Composition root. The single place where the
// application's port interfaces are wired to concrete
// infrastructure adapters. Routes and server actions
// import the methods on this object instead of reaching
// into drizzle / @ai-sdk / clerk directly.
//
// `createComposition()` returns a typed object whose
// methods are the use-cases. Tests can call
// `createTestComposition()` to get a composition with
// fakes for every port.
import {
  ingestFile,
  searchChunks,
  listUsers,
  setUserRole,
  touchLastSeen,
  getUserByClerkId,
  logDocumentEvent,
  logTicketEvent,
  recordQuery,
  getTopQueries,
  enforceRateLimit,
  listDocuments,
  uploadPdf,
  softDeleteDocument,
  restoreDocument,
  listTickets,
  updateTicket,
  isTicketStatus,
  TICKET_STATUSES,
  getDocumentById,
  hardDeleteDocument,
  replacePdf,
  recountChunksForDocument,
  recountChunksForAllDocuments,
  getAnalyticsSummary,
  listAudit,
  type IngestDeps,
  type SearchDeps,
  type RateLimitDeps,
} from '@app/application';
import { Db, Llm, Auth, Pdf } from '@app/infrastructure';
import { requireAdmin, requireSession, getAppSession, ForbiddenError } from '@app/infrastructure/auth';
import { type MyUIMessage } from '@app/domain';
import { createHash } from 'node:crypto';
import { appConfig } from './lib/config';
import { unwrap } from '@app/domain';

const systemClock = { now: () => new Date() };

const systemHasher = { sha256: (b: Buffer) => createHash('sha256').update(b).digest('hex') };

const documentRepo = {
  findByName: (name: string) => Db.findDocumentByName(name),
  findById: (id: number) => Db.findDocumentById(id),
  saveBlob: (id: number, blob: Buffer) => Db.updateDocumentBlob(id, blob),
  insert: (input: { fileName: string; fileHash: string; uploadedBy: string }) =>
    Db.insertDocument(input),
  deleteById: (id: number) => Db.deleteDocumentById(id),
  softDelete: (id: number, at: Date) => Db.softDeleteDocument(id, at),
  restore: (id: number) => Db.restoreDocument(id),
  listDeletedSince: () => Promise.resolve([]),
  updateBlob: (id: number, blob: Buffer) => Db.updateDocumentBlob(id, blob),
  searchByVector: (embedding: number[], opts: { threshold: number; limit: number }) =>
    Db.searchChunksByVector(embedding, opts),
  list: Db.listDocuments,
  countChunksForDocuments: Db.countChunksForDocuments,
  countChunksForAll: Db.countChunksForAll,
};

const chunkRepo = {
  insertMany: (rows: Array<{ documentId: number; content: string; embedding: number[] }>) =>
    Db.insertChunks(rows),
  countForDocuments: (ids: number[]) => Db.countChunksForDocuments(ids),
  countForAll: () => Db.countChunksForAll(),
  countForDocument: (id: number) => Db.countChunksForDocument(id),
  recountAll: () => Db.recountChunksForAll(),
  searchByVector: (embedding: number[], opts: { threshold: number; limit: number }) =>
    Db.searchChunksByVector(embedding, opts),
};

const ingestDeps: IngestDeps = {
  documents: documentRepo,
  embeddings: Llm.googleEmbeddingService,
  hasher: systemHasher,
  pdfParser: Pdf.pdfParseParser,
  textSplitter: Pdf.langchainSplitter,
};

const searchDeps: SearchDeps = {
  chunks: chunkRepo,
  embeddings: Llm.googleEmbeddingService,
};

const rateLimitDeps: RateLimitDeps = { limiter: Auth.lruRateLimiter };

export function createComposition() {
  return {
    ingestFile: (input: Parameters<typeof ingestFile>[0]) => ingestFile(input, ingestDeps).then(unwrap),
    searchChunks: (query: string, opts: Parameters<typeof searchChunks>[1]) =>
      searchChunks(query, opts, searchDeps).then(unwrap),
    listUsers: (input: Parameters<typeof listUsers>[0]) => listUsers(input, { users: Db.userRepo }).then(unwrap),
    setUserRole: (input: Parameters<typeof setUserRole>[0]) =>
      setUserRole(input, { users: Db.userRepo, audit: Db.auditRepo }).then(unwrap),
    touchLastSeen: (clerkUserId: string) => touchLastSeen(clerkUserId, { users: Db.userRepo }).then(unwrap),
    getUserByClerkId: (clerkUserId: string) =>
      getUserByClerkId(clerkUserId, { users: Db.userRepo }).then(unwrap),
    logDocumentEvent: (input: Parameters<typeof logDocumentEvent>[0]) =>
      logDocumentEvent(input, { audit: Db.auditRepo }).then(unwrap),
    logTicketEvent: (input: Parameters<typeof logTicketEvent>[0]) =>
      logTicketEvent(input, { audit: Db.auditRepo }).then(unwrap),
    recordQuery: (userId: string, query: string) =>
      unwrap(recordQuery(userId, query, { stats: Auth.inMemoryQueryStats })),
    getTopQueries: (limit: number) => unwrap(getTopQueries(limit, { stats: Auth.inMemoryQueryStats })),
    enforceRateLimit: (input: Parameters<typeof enforceRateLimit>[0]) =>
      enforceRateLimit(input, rateLimitDeps).then(unwrap),
    listDocuments: (input: Parameters<typeof listDocuments>[0]) =>
      listDocuments(input, { documents: documentRepo, chunks: chunkRepo }).then(unwrap),
    uploadPdf: (input: Parameters<typeof uploadPdf>[0]) =>
      uploadPdf(input, { ...ingestDeps, audit: Db.auditRepo }).then(unwrap),
    softDeleteDocument: (input: Parameters<typeof softDeleteDocument>[0]) =>
      softDeleteDocument(input, { documents: documentRepo, audit: Db.auditRepo }).then(unwrap),
    restoreDocument: (id: number, actorId: string) =>
      restoreDocument(id, actorId, { documents: documentRepo, audit: Db.auditRepo, clock: systemClock }).then(unwrap),
    listTickets: (input: Parameters<typeof listTickets>[0]) =>
      listTickets(input, { tickets: Db.ticketRepo }).then(unwrap),
    updateTicket: (input: Parameters<typeof updateTicket>[0]) =>
      updateTicket(input, { tickets: Db.ticketRepo, audit: Db.auditRepo }).then(unwrap),
    getDocumentById: (id: number) =>
      getDocumentById(id, { documents: documentRepo }).then((r) => unwrap(r).document),
    hardDeleteDocument: (input: { documentId: number; actorId: string }) =>
      hardDeleteDocument(input, { documents: documentRepo, audit: Db.auditRepo }).then(unwrap),
    replacePdf: (input: { documentId: number; fileName: string; buffer: Buffer; actorId: string }) =>
      replacePdf(input, { ...ingestDeps, audit: Db.auditRepo }).then(unwrap),
    recountChunksForDocument: (id: number) =>
      recountChunksForDocument(id, { chunks: chunkRepo }).then(unwrap),
    recountChunksForAllDocuments: () =>
      recountChunksForAllDocuments({ chunks: chunkRepo }).then(unwrap),
    getAnalyticsSummary: () =>
      getAnalyticsSummary({ documents: documentRepo, chunks: chunkRepo, tickets: Db.ticketRepo, users: Db.userRepo, stats: Auth.inMemoryQueryStats }).then(unwrap),
    listAudit: (input: { documentId?: number; ticketId?: string; limit?: number; offset?: number }) =>
      listAudit(input, { audit: Db.auditRepo }).then(unwrap),
    // Adapter singletons (used by code that still needs them,
    // e.g. the chat route, the seed script, and server actions).
    db: Db.db,
    schema: Db.schema,
    getEmbeddingModel: Llm.getEmbeddingModel,
    getChatModel: Llm.getChatModel,
    session: Auth.clerkSessionStore,
    rateLimit: (key: string, opts: { limit: number; windowMs: number }) =>
      Auth.lruRateLimiter.check(key, opts),
  };
}

export { appConfig, isTicketStatus, TICKET_STATUSES, type MyUIMessage };
export { requireAdmin, requireSession, getAppSession, ForbiddenError };

export type Composition = ReturnType<typeof createComposition>;

let _composition: Composition | null = null;
export function getComposition(): Composition {
  if (!_composition) _composition = createComposition();
  return _composition;
}

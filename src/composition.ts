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
  type IngestDeps,
  type SearchDeps,
  type RateLimitDeps,
} from '@app/application';
import { Db, Llm, Auth, Pdf } from '@app/infrastructure';
import { createHash } from 'node:crypto';

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
    ingestFile: (input: Parameters<typeof ingestFile>[0]) => ingestFile(input, ingestDeps),
    searchChunks: (query: string, opts: Parameters<typeof searchChunks>[1]) =>
      searchChunks(query, opts, searchDeps),
    listUsers: (input: Parameters<typeof listUsers>[0]) => listUsers(input, { users: Db.userRepo }),
    setUserRole: (input: Parameters<typeof setUserRole>[0]) =>
      setUserRole(input, { users: Db.userRepo, audit: Db.auditRepo }),
    touchLastSeen: (clerkUserId: string) => touchLastSeen(clerkUserId, { users: Db.userRepo }),
    getUserByClerkId: (clerkUserId: string) =>
      getUserByClerkId(clerkUserId, { users: Db.userRepo }),
    logDocumentEvent: (input: Parameters<typeof logDocumentEvent>[0]) =>
      logDocumentEvent(input, { audit: Db.auditRepo }),
    logTicketEvent: (input: Parameters<typeof logTicketEvent>[0]) =>
      logTicketEvent(input, { audit: Db.auditRepo }),
    recordQuery: (userId: string, query: string) =>
      recordQuery(userId, query, { stats: Auth.inMemoryQueryStats }),
    getTopQueries: (limit: number) => getTopQueries(limit, { stats: Auth.inMemoryQueryStats }),
    enforceRateLimit: (input: Parameters<typeof enforceRateLimit>[0]) =>
      enforceRateLimit(input, rateLimitDeps),
    listDocuments: (input: Parameters<typeof listDocuments>[0]) =>
      listDocuments(input, { documents: documentRepo, chunks: chunkRepo }),
    uploadPdf: (input: Parameters<typeof uploadPdf>[0]) =>
      uploadPdf(input, { ...ingestDeps, audit: Db.auditRepo }),
    softDeleteDocument: (input: Parameters<typeof softDeleteDocument>[0]) =>
      softDeleteDocument(input, { documents: documentRepo, audit: Db.auditRepo }),
    restoreDocument: (id: number, actorId: string) =>
      restoreDocument(id, actorId, { documents: documentRepo, audit: Db.auditRepo, clock: systemClock }),
    listTickets: (input: Parameters<typeof listTickets>[0]) =>
      listTickets(input, { tickets: Db.ticketRepo }),
    updateTicket: (input: Parameters<typeof updateTicket>[0]) =>
      updateTicket(input, { tickets: Db.ticketRepo, audit: Db.auditRepo }),
    // Adapter singletons (used by code that still needs them,
    // e.g. the chat route, the seed script, and server actions).
    db: Db.db,
    schema: Db.schema,
    getEmbeddingModel: Llm.getEmbeddingModel,
    getChatModel: Llm.getChatModel,
    session: Auth.clerkSessionStore,
  };
}

export type Composition = ReturnType<typeof createComposition>;

let _composition: Composition | null = null;
export function getComposition(): Composition {
  if (!_composition) _composition = createComposition();
  return _composition;
}

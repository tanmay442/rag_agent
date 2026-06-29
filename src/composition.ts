// Composition root: wires port interfaces to infrastructure adapters.
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
  VALID_TRANSITIONS,
  type TicketStatus,
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
import { requireAdmin, requireSession, getAppSession } from '@app/infrastructure/auth';
import { ForbiddenError, UnauthorizedError } from '@app/domain';
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
  chunks: chunkRepo,
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

function createComposition() {
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
      listDocuments(input, { documents: documentRepo, chunks: chunkRepo, users: Db.userRepo }).then(unwrap),
    uploadPdf: (input: Parameters<typeof uploadPdf>[0]) =>
      uploadPdf(input, { ...ingestDeps, audit: Db.auditRepo, runner: Db.transactionRunner }).then(unwrap),
    softDeleteDocument: (input: Parameters<typeof softDeleteDocument>[0]) =>
      softDeleteDocument(input, { documents: documentRepo, audit: Db.auditRepo, runner: Db.transactionRunner }).then(unwrap),
    restoreDocument: (id: number, actorId: string) =>
      restoreDocument(id, actorId, { documents: documentRepo, audit: Db.auditRepo, clock: systemClock, runner: Db.transactionRunner }).then(unwrap),
    listTickets: (input: Parameters<typeof listTickets>[0]) =>
      listTickets(input, { tickets: Db.ticketRepo }).then(unwrap),
    updateTicket: (input: Parameters<typeof updateTicket>[0]) =>
      updateTicket(input, { tickets: Db.ticketRepo, audit: Db.auditRepo }).then(unwrap),
    getDocumentById: (id: number) =>
      getDocumentById(id, { documents: documentRepo }).then((r) => unwrap(r).document),
    hardDeleteDocument: (input: { documentId: number; actorId: string }) =>
      hardDeleteDocument(input, { documents: documentRepo, audit: Db.auditRepo, runner: Db.transactionRunner }).then(unwrap),
    replacePdf: (input: { documentId: number; fileName: string; buffer: Buffer; actorId: string }) =>
      replacePdf(input, { ...ingestDeps, audit: Db.auditRepo, runner: Db.transactionRunner }).then(unwrap),
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

export { appConfig, isTicketStatus, TICKET_STATUSES, VALID_TRANSITIONS, type TicketStatus, type MyUIMessage };
export { requireAdmin, requireSession, getAppSession, ForbiddenError, UnauthorizedError };

export type Composition = ReturnType<typeof createComposition>;

let _composition: Composition | null = null;
export function getComposition(): Composition {
  if (!_composition) _composition = createComposition();
  return _composition;
}

/**
 * Reset the singleton composition to null. Intended for test
 * isolation so each test suite starts with a fresh composition.
 */
export function resetComposition() {
  _composition = null;
}

/**
 * Shorthand for admin API routes. Returns either the session +
 * composition or a 403 NextResponse. Eliminates the try/catch
 * boilerplate that every admin route repeats.
 */
export async function requireAdminRoute(): Promise<
  | { ok: true; session: Awaited<ReturnType<typeof requireAdmin>>; comp: Composition }
  | { ok: false; response: Response }
> {
  try {
    const session = await requireAdmin();
    return { ok: true, session, comp: getComposition() };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
    }
    if (err instanceof ForbiddenError) {
      return { ok: false, response: new Response('Forbidden', { status: 403 }) };
    }
    // Clerk-specific errors (network, rate-limit, misconfiguration) or
    // any other unexpected error should yield a 503 so the client can
    // retry instead of seeing a 500.
    console.error('requireAdminRoute failed', err);
    return { ok: false, response: new Response('Service Unavailable', { status: 503 }) };
  }
}

/**
 * Parse `limit` and `offset` query params with sensible defaults.
 * Used by the list endpoints (audit, tickets, users) to avoid
 * repeating the same Number(...) boilerplate in every route.
 */
export function parseQueryPagination(
  url: URL,
  defaults: { limit?: number; offset?: number } = {},
): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get('limit') ?? defaults.limit ?? 25);
  const rawOffset = Number(url.searchParams.get('offset') ?? defaults.offset ?? 0);
  // Note: Negative values are clamped to 0 downstream by the database layer.
  return {
    limit: Number.isFinite(rawLimit) ? rawLimit : (defaults.limit ?? 25),
    offset: Number.isFinite(rawOffset) ? rawOffset : (defaults.offset ?? 0),
  };
}

/**
 * One-liner for admin GET routes: runs the auth check, parses
 * the request URL, and returns either the composition + URL or
 * a 403 response. Eliminates the 6-line auth+url boilerplate
 * that audit/tickets/users repeat.
 */
export async function requireAdminGet(
  req: Request,
): Promise<
  | { ok: true; comp: Composition; url: URL }
  | { ok: false; response: Response }
> {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth;
  return { ok: true, comp: auth.comp, url: new URL(req.url) };
}

/**
 * One-liner for admin document routes: auth + parse id param +
 * fetch the document. Returns either the session+document or a
 * 403/400/404/410 response. Used by the blob and download routes.
 */
export async function requireAdminDocument(
  context: { params: Promise<{ id: string }> },
  opts: { allowDeleted?: boolean } = {},
): Promise<
  | {
      ok: true;
      session: Awaited<ReturnType<typeof requireAdmin>>;
      comp: Composition;
      document: NonNullable<Awaited<ReturnType<Composition['getDocumentById']>>>;
    }
  | { ok: false; response: Response }
> {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth;
  const { id } = await context.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) {
    return { ok: false, response: new Response('Invalid id', { status: 400 }) };
  }
  const doc = await auth.comp.getDocumentById(docId);
  if (!doc) return { ok: false, response: new Response('Not found', { status: 404 }) };
  if (!opts.allowDeleted && doc.deletedAt) {
    return { ok: false, response: new Response('Gone', { status: 410 }) };
  }
  if (!doc.blob) {
    return { ok: false, response: new Response('File unavailable', { status: 404 }) };
  }
  return { ok: true, session: auth.session, comp: auth.comp, document: doc };
}

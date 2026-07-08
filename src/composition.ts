// Composition root: assembles Effect service layers into a memoized
// runtime and exposes a facade whose methods run the Effect use-cases
// via that runtime. Domain errors propagate as rejected promises
// (tagged errors); routes catch them and hand them to `respond`.
import { Effect, Layer, Runtime } from 'effect';
import {
  Documents,
  Chunks,
  Tickets,
  Users,
  Audit,
  RateLimiter,
  QueryStats,
  Embeddings,
  BlobStorage,
  IngestQueue,
  PdfParser,
  TextSplitter,
  TransactionRunner,
  Clock,
  Hasher,
  SessionStore,
  NotFoundError,
  ValidationError,
  GoneError,
  ExternalServiceError,
  type DocumentRow,
  type SessionUser,
  type Session,
} from '@app/domain';
import {
  DbServicesLayer,
  InfraServicesLayer,
  Llm,
  Storage,
  Auth,
} from '@app/infrastructure';
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
  createTicket,
  getDocumentById,
  hardDeleteDocument,
  replacePdf,
  recountChunksForDocument,
  recountChunksForAllDocuments,
  getAnalyticsSummary,
  listAudit,
  prepareIngest,
} from '@app/application';
import { type MyUIMessage } from '@app/application/chat';
import { ForbiddenError, UnauthorizedError } from '@app/domain';
import { appConfig } from './lib/config';
import { logger } from './lib/logger';
import { respond } from './lib/http';
import { MAX_LIST_LIMIT } from '../config/constants';

// Layer assembly: DB-backed + infrastructure services in one layer.
export const appLayer = Layer.mergeAll(DbServicesLayer, InfraServicesLayer);

/** Run an Effect program with all services provided.
 *  This is the single canonical `Effect.runPromise` call site used by
 *  route handlers and server actions. */
export function runEffect<A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(appLayer as Layer.Layer<AppServices>)) as Effect.Effect<A, E, never>,
  );
}

type AppServices =
  | Documents
  | Chunks
  | Tickets
  | Users
  | Audit
  | RateLimiter
  | QueryStats
  | Embeddings
  | BlobStorage
  | IngestQueue
  | PdfParser
  | TextSplitter
  | TransactionRunner
  | Clock
  | Hasher
  | SessionStore;

let _runtime: Runtime.Runtime<AppServices> | null = null;
const runtimePromise: Promise<Runtime.Runtime<AppServices>> = Effect.runPromise(
  Layer.toRuntime(appLayer).pipe(Effect.scoped),
);
async function runtime(): Promise<Runtime.Runtime<AppServices>> {
  if (!_runtime) _runtime = await runtimePromise;
  return _runtime;
}

/** Run an Effect use-case against the app runtime, returning its
 *  success value. Domain errors reject the promise (tagged errors). */
export async function runWithLayer<A, E, R extends AppServices>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  const rt = await runtime();
  return Runtime.runPromise(rt)(effect as Effect.Effect<A, E, AppServices>);
}

/** Run a facade Promise and map the result into an HTTP Response:
 *  success → 200 JSON value, failure → `respond(error)`. */
export async function runComp<T>(p: Promise<T>): Promise<Response> {
  try {
    const value = await p;
    return Response.json(value);
  } catch (e) {
    return respond(e);
  }
}

/** Run a facade Promise that resolves to void: success → 200 `{ ok: true }`,
 *  failure → `respond(error)`. */
export async function runCompVoid(p: Promise<void>): Promise<Response> {
  try {
    await p;
    return Response.json({ ok: true });
  } catch (e) {
    return respond(e);
  }
}

/** Run an Effect use-case and map the result into an HTTP Response:
 *  success → 200 JSON, failure → `respond(error)` with the correct
 *  status. This is the primary helper for API route handlers. */
export async function runRoute<A, E, R extends AppServices>(
  effect: Effect.Effect<A, E, R>,
): Promise<Response> {
  try {
    const value = await runWithLayer(effect);
    return Response.json(value);
  } catch (e) {
    return respond(e);
  }
}

// ingested-queue drain is an Effect workflow assembled here (not in
// the application package) because it orchestrates blob storage,
// embeddings, pdf parsing, and a transactional chunk insert.
const ingestQueuedDocumentEffect = Effect.fn('Admin.ingestQueuedDocument')(
  function* (documentId: number) {
    const documents = yield* Documents;
    const blobStorage = yield* BlobStorage;
    const runner = yield* TransactionRunner;

    const doc = yield* documents.findById(documentId);
    if (!doc) return yield* new NotFoundError(`Document not found: ${documentId}`);
    if (doc.ingestStatus === 'done') return { status: 'already-done' as const, chunks: 0 };
    if (doc.ingestStatus === 'ingesting') return { status: 'busy' as const, chunks: 0 };
    if (!doc.storageKey) return yield* new NotFoundError(`Document ${documentId} has no stored blob`);
    yield* documents.updateIngestStatus(documentId, 'ingesting');
    const buffer = yield* blobStorage.get(doc.storageKey).pipe(
      Effect.catchAll((e) =>
        documents
          .updateIngestStatus(documentId, 'failed')
          .pipe(Effect.catchAll(() => Effect.void), Effect.zipRight(Effect.fail(e))),
      ),
    );
    const prepared = yield* prepareIngest({
      documentId,
      fileName: doc.fileName,
      buffer,
    }).pipe(
      Effect.catchAll((e) =>
        documents
          .updateIngestStatus(documentId, 'failed')
          .pipe(Effect.catchAll(() => Effect.void), Effect.zipRight(Effect.fail(e))),
      ),
    );
    yield* runner
      .run((ctx) =>
        Effect.gen(function* () {
          yield* ctx.chunks.insertMany(prepared.rows);
          yield* ctx.documents.updateIngestStatus(documentId, 'done');
        }),
      )
      .pipe(
        Effect.catchAll((e) =>
          documents
            .updateIngestStatus(documentId, 'failed')
            .pipe(Effect.catchAll(() => Effect.void), Effect.zipRight(Effect.fail(e))),
        ),
      );
    return { status: 'done' as const, chunks: prepared.chunks };
  },
);

function createComposition() {
  return {
    ingestFile: (input: { fileName: string; buffer: Buffer; uploadedBy: string }) =>
      runWithLayer(ingestFile(input)),
    searchChunks: (q: string, o: { threshold?: number; limit?: number }) =>
      runWithLayer(searchChunks(q, o)),
    listUsers: (input: { search?: string; limit?: number; offset?: number }) =>
      runWithLayer(listUsers(input)),
    setUserRole: (input: { clerkUserId: string; role: 'admin' | 'user'; actorId: string }) =>
      runWithLayer(setUserRole(input)),
    touchLastSeen: (id: string) => runWithLayer(touchLastSeen(id)),
    getUserByClerkId: (id: string) => runWithLayer(getUserByClerkId(id)),
    logDocumentEvent: (input: {
      action: 'upload' | 'replace' | 'delete' | 'restore';
      documentId: number;
      actorId: string;
    }) => runWithLayer(logDocumentEvent(input)),
    logTicketEvent: (input: {
      action: 'create' | 'assign' | 'status_change' | 'note' | 'role_change';
      ticketId: string;
      actorId: string;
    }) => runWithLayer(logTicketEvent(input)),
    recordQuery: (userId: string, query: string) => runWithLayer(recordQuery(userId, query)),
    getTopQueries: (limit: number) => runWithLayer(getTopQueries(limit)),
    enforceRateLimit: (input: { key: string; limit: number; windowMs: number }) =>
      runWithLayer(enforceRateLimit(input)),
    listDocuments: (input: {
      search?: string;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }) => runWithLayer(listDocuments(input)),
    uploadPdf: (input: { fileName: string; buffer: Buffer; actorId: string }) =>
      runWithLayer(uploadPdf(input)),
    softDeleteDocument: (input: { documentId: number; actorId: string }) =>
      runWithLayer(softDeleteDocument(input)),
    restoreDocument: (id: number, actorId: string) => runWithLayer(restoreDocument(id, actorId)),
    listTickets: (input: {
      status?: 'created' | 'in_progress' | 'closed';
      assignee?: string | null;
      search?: string;
      limit?: number;
      offset?: number;
    }) => runWithLayer(listTickets(input)),
    updateTicket: (input: {
      ticketId: string;
      status?: 'created' | 'in_progress' | 'closed';
      assignedTo?: string | null;
      note?: string;
      actorId: string;
    }) => runWithLayer(updateTicket(input)),
    createTicket: (input: {
      userId: string;
      name: string;
      email: string;
      issue: string;
    }) => runWithLayer(createTicket(input)),
    getDocumentById: (id: number) => runWithLayer(getDocumentById(id)),
    hardDeleteDocument: (input: { documentId: number; actorId: string }) =>
      runWithLayer(hardDeleteDocument(input)),
    replacePdf: (input: {
      documentId: number;
      fileName: string;
      buffer: Buffer;
      actorId: string;
    }) => runWithLayer(replacePdf(input)),
    recountChunksForDocument: (id: number) => runWithLayer(recountChunksForDocument(id)),
    recountChunksForAllDocuments: () => runWithLayer(recountChunksForAllDocuments()),
    getAnalyticsSummary: () => runWithLayer(getAnalyticsSummary()),
    listAudit: (input: {
      documentId?: number;
      ticketId?: string;
      limit?: number;
      offset?: number;
    }) => runWithLayer(listAudit(input)),
    ingestQueuedDocument: (documentId: number) =>
      runWithLayer(ingestQueuedDocumentEffect(documentId)),
    // Raw adapters exposed for routes that stream/redirect blobs directly.
    blobStorage: Storage.createBlobStorage(),
    getChatModel: Llm.getChatModel,
    rateLimit: async (key: string, opts: { limit: number; windowMs: number }) =>
      runWithLayer(enforceRateLimit({ key, ...opts })),
  };
}

export { appConfig, type MyUIMessage };
export { TICKET_STATUSES, isTicketStatus } from '@app/application';
export { respond, ForbiddenError, UnauthorizedError };

export type Composition = ReturnType<typeof createComposition>;

let _composition: Composition | null = null;
export function getComposition(): Composition {
  if (!_composition) _composition = createComposition();
  return _composition;
}

// ---- Auth-boundary helpers (unchanged shape) ----

const authAdapter = Auth.createAuthAdapter();
const requireAdmin = authAdapter.requireAdmin;
const requireSession = authAdapter.requireSession;
const getAppSession = authAdapter.getAppSession;
export { requireAdmin, requireSession, getAppSession };

export async function requireAdminRoute(): Promise<
  | { ok: true; session: { user: SessionUser }; comp: Composition }
  | { ok: false; response: Response }
> {
  try {
    const session = await requireAdmin();
    return { ok: true, session, comp: getComposition() };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, response: respond(new UnauthorizedError()) };
    if (e instanceof ForbiddenError) return { ok: false, response: respond(new ForbiddenError()) };
    logger.error('requireAdminRoute failed', { error: e });
    return { ok: false, response: respond(new ExternalServiceError('Service unavailable', e)) };
  }
}

export function parseQueryPagination(
  url: URL,
  defaults: { limit?: number; offset?: number } = {},
): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get('limit') ?? defaults.limit ?? 25);
  const rawOffset = Number(url.searchParams.get('offset') ?? defaults.offset ?? 0);
  return {
    limit: Math.min(
      Math.max(Math.floor(Number.isFinite(rawLimit) ? rawLimit : (defaults.limit ?? 25)), 1),
      MAX_LIST_LIMIT,
    ),
    offset: Math.max(Math.floor(Number.isFinite(rawOffset) ? rawOffset : (defaults.offset ?? 0)), 0),
  };
}

/** Parse a `page` search-param into a 1-based integer, falling
 *  back gracefully on NaN, negatives, or floats. */
export function parsePageParam(raw: string | undefined, fallback = 1): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

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

export async function requireAdminDocument(
  context: { params: Promise<{ id: string }> },
  opts: { allowDeleted?: boolean } = {},
): Promise<
  | {
      ok: true;
      session: { user: SessionUser };
      comp: Composition;
      document: DocumentRow;
    }
  | { ok: false; response: Response }
> {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth;
  const { id } = await context.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) return { ok: false, response: respond(new ValidationError('Invalid id')) };
  try {
    const r = await auth.comp.getDocumentById(docId);
    const doc = r.document;
    if (!doc) return { ok: false, response: respond(new NotFoundError('Document not found')) };
    if (!opts.allowDeleted && doc.deletedAt)
      return { ok: false, response: respond(new GoneError('Document was deleted')) };
    if (!doc.storageKey) return { ok: false, response: respond(new NotFoundError('File unavailable')) };
    return { ok: true, session: auth.session, comp: auth.comp, document: doc };
   } catch (e) {
    return { ok: false, response: respond(e) };
  }
}

// ---- Effect-returning auth helpers (compose inside Effect.gen) ----

/** Require an admin session. Returns the session or fails with
 *  UnauthorizedError / ForbiddenError. Compose inside Effect.gen. */
export function requireAdminEffect(): Effect.Effect<
  Session,
  UnauthorizedError | ForbiddenError | ExternalServiceError,
  SessionStore
> {
  return Effect.gen(function* () {
    const sessionStore = yield* SessionStore;
    const session = yield* sessionStore.getSession();
    if (!session) return yield* new UnauthorizedError();
    if (session.user.role !== 'admin') return yield* new ForbiddenError();
    return session;
  });
}

/** Require a signed-in session (any role). */
export function requireSessionEffect(): Effect.Effect<
  Session,
  UnauthorizedError | ExternalServiceError,
  SessionStore
> {
  return Effect.gen(function* () {
    const sessionStore = yield* SessionStore;
    const session = yield* sessionStore.getSession();
    if (!session) return yield* new UnauthorizedError();
    return session;
  });
}

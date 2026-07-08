/* eslint-disable @typescript-eslint/no-namespace */
// Live Effect service layers for the DB-backed repositories, plus the
// `DbClient` service and the `TransactionRunner` implementation.
//
// `TransactionRunner.run` executes the callback inside a Drizzle
// transaction. Drizzle requires a Promise-returning callback, so the
// Effect-based body is run via `Runtime.runPromise` inside it — the
// one sanctioned `runPromise`-in-business-logic exception. The
// current runtime is captured with `Effect.runtime` so the body
// inherits the surrounding service context (embeddings, blob storage,
// …). Domain errors (`_tag`-tagged) propagate unwrapped; everything
// else is wrapped in `ExternalServiceError`.
import { Context, Effect, Layer, Runtime } from 'effect';
import { db } from './client';
import {
  findDocumentByName,
  findDocumentById,
  insertDocument,
  deleteDocumentById,
  setDocumentStorageKey,
  updateDocumentIngestStatus,
  softDeleteDocument,
  restoreDocument,
  listDocuments,
  countChunksForDocuments,
  countChunksForAll,
  searchChunksByVector,
  insertChunks,
  countChunksForDocument,
  recountChunksForAll,
  ticketRepo,
  userRepo,
  auditRepo,
} from './repositories';
import {
  Documents,
  Chunks,
  Tickets,
  Users,
  Audit,
  TransactionRunner,
  ExternalServiceError,
  type TransactionContext,
} from '@app/domain';

type Client = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export class DbClient extends Context.Tag('@app/DbClient')<DbClient, DbClient.Service>() {}
export namespace DbClient {
  export interface Service {
    readonly client: Client;
  }
}

export const DbClientLive = Layer.sync(DbClient, () => ({ client: db }));

// ---- Documents ----

export const DocumentsLive = Layer.effect(
  Documents,
  Effect.gen(function* () {
    const { client } = yield* DbClient;
    return {
      findByName: (name: string) => findDocumentByName(name, client),
      findById: (id: number) => findDocumentById(id, client),
      setStorageKey: (id: number, key: string) => setDocumentStorageKey(id, key, client),
      updateIngestStatus: (id: number, status: Parameters<typeof updateDocumentIngestStatus>[1]) =>
        updateDocumentIngestStatus(id, status, client),
      insert: (input: Parameters<typeof insertDocument>[0]) => insertDocument(input, client),
      deleteById: (id: number) => deleteDocumentById(id, client),
      softDelete: (id: number, at: Date) => softDeleteDocument(id, at, client),
      restore: (id: number) => restoreDocument(id, client),
      list: (opts: Parameters<typeof listDocuments>[0]) => listDocuments(opts, client),
      countChunksForDocuments: (ids: number[]) => countChunksForDocuments(ids, client),
      countChunksForAll: () => countChunksForAll(client),
    } satisfies Documents.Service;
  }),
);

// ---- Chunks ----

export const ChunksLive = Layer.effect(
  Chunks,
  Effect.gen(function* () {
    const { client } = yield* DbClient;
    return {
      searchByVector: (embedding: number[], opts: { threshold: number; limit: number }) =>
        searchChunksByVector(embedding, opts, client),
      insertMany: (rows: Parameters<typeof insertChunks>[0]) => insertChunks(rows, client),
      countForDocuments: (ids: number[]) => countChunksForDocuments(ids, client),
      countForAll: () => countChunksForAll(client),
      countForDocument: (id: number) => countChunksForDocument(id, client),
      recountAll: () => recountChunksForAll(client),
    } satisfies Chunks.Service;
  }),
);

// ---- Tickets ----

export const TicketsLive = Layer.effect(
  Tickets,
  Effect.gen(function* () {
    const { client } = yield* DbClient;
    return {
      findByTicketId: (ticketId: string) => ticketRepo.findByTicketId(ticketId, client),
      list: (opts: Parameters<typeof ticketRepo.list>[0]) => ticketRepo.list(opts, client),
      latest: () => ticketRepo.latest(client),
      insert: (input: Parameters<typeof ticketRepo.insert>[0]) => ticketRepo.insert(input, client),
      update: (ticketId: string, patch: Parameters<typeof ticketRepo.update>[1]) =>
        ticketRepo.update(ticketId, patch, client),
      countAll: () => ticketRepo.countAll(client),
      countOpen: () => ticketRepo.countOpen(client),
    } satisfies Tickets.Service;
  }),
);

// ---- Users ----

export const UsersLive = Layer.effect(
  Users,
  Effect.gen(function* () {
    const { client } = yield* DbClient;
    return {
      upsertFromClerk: (input: Parameters<typeof userRepo.upsertFromClerk>[0]) =>
        userRepo.upsertFromClerk(input, client),
      findByClerkId: (clerkUserId: string) => userRepo.findByClerkId(clerkUserId, client),
      findByIds: (clerkUserIds: string[]) => userRepo.findByIds(clerkUserIds, client),
      setRole: (clerkUserId: string, role: 'admin' | 'user') => userRepo.setRole(clerkUserId, role, client),
      touchLastSeen: (clerkUserId: string) => userRepo.touchLastSeen(clerkUserId, client),
      list: (opts: Parameters<typeof userRepo.list>[0]) => userRepo.list(opts, client),
      countAll: () => userRepo.countAll(client),
      syncClerkRole: (clerkUserId: string, role: 'admin' | 'user') => userRepo.syncClerkRole(clerkUserId, role),
    } satisfies Users.Service;
  }),
);

// ---- Audit ----

export const AuditLive = Layer.effect(
  Audit,
  Effect.gen(function* () {
    const { client } = yield* DbClient;
    return {
      logDocumentEvent: (input: Parameters<typeof auditRepo.logDocumentEvent>[0]) =>
        auditRepo.logDocumentEvent(input, client),
      logTicketEvent: (input: Parameters<typeof auditRepo.logTicketEvent>[0]) =>
        auditRepo.logTicketEvent(input, client),
      list: (input: Parameters<typeof auditRepo.list>[0]) => auditRepo.list(input, client),
    } satisfies Audit.Service;
  }),
);

// ---- Transaction context ----

/** Build the transaction-scoped service implementations for one tx. */
export function createTransactionContext(tx: Client): TransactionContext {
  return {
    documents: {
      findByName: (name) => findDocumentByName(name, tx),
      findById: (id) => findDocumentById(id, tx),
      setStorageKey: (id, key) => setDocumentStorageKey(id, key, tx),
      updateIngestStatus: (id, status) => updateDocumentIngestStatus(id, status, tx),
      insert: (input) => insertDocument(input, tx),
      deleteById: (id) => deleteDocumentById(id, tx),
      softDelete: (id, at) => softDeleteDocument(id, at, tx),
      restore: (id) => restoreDocument(id, tx),
      list: (opts) => listDocuments(opts, tx),
      countChunksForDocuments: (ids) => countChunksForDocuments(ids, tx),
      countChunksForAll: () => countChunksForAll(tx),
    },
    chunks: {
      searchByVector: (embedding, opts) => searchChunksByVector(embedding, opts, tx),
      insertMany: (rows) => insertChunks(rows, tx),
      countForDocuments: (ids) => countChunksForDocuments(ids, tx),
      countForAll: () => countChunksForAll(tx),
      countForDocument: (id) => countChunksForDocument(id, tx),
      recountAll: () => recountChunksForAll(tx),
    },
    audit: {
      logDocumentEvent: (input) => auditRepo.logDocumentEvent(input, tx),
      logTicketEvent: (input) => auditRepo.logTicketEvent(input, tx),
      list: (input) => auditRepo.list(input, tx),
    },
    tickets: {
      findByTicketId: (ticketId) => ticketRepo.findByTicketId(ticketId, tx),
      list: (opts) => ticketRepo.list(opts, tx),
      latest: () => ticketRepo.latest(tx),
      insert: (input) => ticketRepo.insert(input, tx),
      update: (ticketId, patch) => ticketRepo.update(ticketId, patch, tx),
      countAll: () => ticketRepo.countAll(tx),
      countOpen: () => ticketRepo.countOpen(tx),
    },
    users: {
      upsertFromClerk: (input) => userRepo.upsertFromClerk(input, tx),
      findByClerkId: (clerkUserId) => userRepo.findByClerkId(clerkUserId, tx),
      findByIds: (clerkUserIds) => userRepo.findByIds(clerkUserIds, tx),
      setRole: (clerkUserId, role) => userRepo.setRole(clerkUserId, role, tx),
      touchLastSeen: (clerkUserId) => userRepo.touchLastSeen(clerkUserId, tx),
      list: (opts) => userRepo.list(opts, tx),
      countAll: () => userRepo.countAll(tx),
      syncClerkRole: (clerkUserId, role) => userRepo.syncClerkRole(clerkUserId, role),
    },
  };
}

function isTaggedError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && '_tag' in e && typeof (e as { _tag: unknown })._tag === 'string';
}

// ---- Transaction runner ----

export const TransactionRunnerLive = Layer.effect(
  TransactionRunner,
  Effect.gen(function* () {
    const { client } = yield* DbClient;
    return {
      run: <A, E, R>(fn: (ctx: TransactionContext) => Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const rt = yield* Effect.runtime<R>();
          return yield* Effect.tryPromise({
            try: () =>
              client.transaction(async (tx) => {
                const ctx = createTransactionContext(tx);
                return Runtime.runPromise(rt)(fn(ctx));
              }),
            catch: (e): E | ExternalServiceError =>
              isTaggedError(e) ? (e as E) : new ExternalServiceError('Transaction failed', e),
          });
        }),
    } satisfies TransactionRunner.Service;
  }),
);

// DbClientLive is provided to the repo layers via `Layer.provide` so
// their `DbClient` requirement is satisfied (Layer.mergeAll builds
// layers in parallel and does not wire inter-layer dependencies).
const dbRepoLayers = Layer.mergeAll(
  DocumentsLive,
  ChunksLive,
  TicketsLive,
  UsersLive,
  AuditLive,
  TransactionRunnerLive,
);

export const DbServicesLayer = dbRepoLayers.pipe(Layer.provide(DbClientLive));

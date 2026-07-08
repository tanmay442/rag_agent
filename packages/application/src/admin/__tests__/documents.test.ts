import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Effect, Layer } from 'effect';
import {
  Documents,
  Audit,
  Chunks,
  Tickets,
  Users,
  TransactionRunner,
  Clock,
  NotFoundError,
  ValidationError,
  GoneError,
  type DocumentRow,
  type TransactionContext,
} from '@app/domain';
import { restoreDocument, softDeleteDocument } from '../documents';
import { RESTORE_WINDOW_MS } from '../../../../../config/constants';
import { expectFailure, runWith, runExit } from '../../__tests__/effect-test-utils';

function docRow(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 1,
    fileName: 'a.pdf',
    fileHash: 'h',
    uploadedBy: 'u',
    uploadedAt: new Date(),
    storageKey: 'docs/1/a.pdf',
    ingestStatus: 'done',
    deletedAt: null,
    ...over,
  };
}

function makeLayers(overrides: {
  documents?: Partial<Documents.Service>;
  audit?: Partial<Audit.Service>;
  clock?: Partial<Clock.Service>;
  runner?: Partial<TransactionRunner.Service>;
} = {}) {
  const documents: Documents.Service = {
    findById: vi.fn().mockReturnValue(Effect.succeed(null)),
    softDelete: vi.fn().mockReturnValue(Effect.succeed(null)),
    restore: vi.fn().mockReturnValue(Effect.succeed(null)),
    list: vi.fn().mockReturnValue(Effect.succeed({ documents: [], total: 0 })),
    findByName: vi.fn().mockReturnValue(Effect.succeed(null)),
    setStorageKey: vi.fn().mockReturnValue(Effect.void),
    insert: vi.fn().mockReturnValue(Effect.succeed(docRow())),
    deleteById: vi.fn().mockReturnValue(Effect.void),
    updateIngestStatus: vi.fn().mockReturnValue(Effect.void),
    countChunksForDocuments: vi.fn().mockReturnValue(Effect.succeed(new Map())),
    countChunksForAll: vi.fn().mockReturnValue(Effect.succeed(0)),
    ...overrides.documents,
  };
  const audit: Audit.Service = {
    logDocumentEvent: vi.fn().mockReturnValue(Effect.void),
    logTicketEvent: vi.fn().mockReturnValue(Effect.void),
    list: vi.fn().mockReturnValue(Effect.succeed({ events: [], total: 0 })),
    ...overrides.audit,
  };
  const clock: Clock.Service = {
    now: vi.fn().mockReturnValue(Effect.succeed(new Date())),
    ...overrides.clock,
  };
  const runner: TransactionRunner.Service = {
    run: ((fn: (ctx: TransactionContext) => Effect.Effect<unknown, unknown, unknown>) =>
      fn({
        documents,
        audit,
        chunks: {} as never,
        tickets: {} as never,
        users: {} as never,
      })) as unknown as TransactionRunner.Service['run'],
    ...overrides.runner,
  };
  return Layer.mergeAll(
    Layer.succeed(Documents, documents),
    Layer.succeed(Audit, audit),
    Layer.succeed(Clock, clock),
    Layer.succeed(TransactionRunner, runner),
    Layer.succeed(Chunks, {} as Chunks.Service),
    Layer.succeed(Tickets, {} as Tickets.Service),
    Layer.succeed(Users, {} as Users.Service),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('restoreDocument', () => {
  it('returns NotFoundError for missing document', async () => {
    const layer = makeLayers();
    const exit = await runExit(restoreDocument(999, 'user_1'), layer);
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('returns ValidationError for non-deleted document', async () => {
    const layer = makeLayers({
      documents: { findById: vi.fn().mockReturnValue(Effect.succeed(docRow({ deletedAt: null }))) },
    });
    const exit = await runExit(restoreDocument(1, 'user_1'), layer);
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('returns GoneError when restore window expired', async () => {
    const deletedAt = new Date(Date.now() - RESTORE_WINDOW_MS - 1000);
    const layer = makeLayers({
      documents: { findById: vi.fn().mockReturnValue(Effect.succeed(docRow({ deletedAt }))) },
      clock: { now: vi.fn().mockReturnValue(Effect.succeed(new Date())) },
    });
    const exit = await runExit(restoreDocument(1, 'user_1'), layer);
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(GoneError);
  });

  it('restores within window', async () => {
    const deletedAt = new Date(Date.now() - 1000);
    const restore = vi.fn().mockReturnValue(Effect.succeed(docRow({ deletedAt: null })));
    const layer = makeLayers({
      documents: {
        findById: vi.fn().mockReturnValue(Effect.succeed(docRow({ deletedAt }))),
        restore,
      },
      clock: { now: vi.fn().mockReturnValue(Effect.succeed(new Date())) },
    });
    await runWith(restoreDocument(1, 'user_1'), layer);
    expect(restore).toHaveBeenCalledWith(1);
  });
});

describe('softDeleteDocument', () => {
  it('returns NotFoundError for missing document', async () => {
    const layer = makeLayers();
    const exit = await runExit(
      softDeleteDocument({ documentId: 999, actorId: 'user_1' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('soft-deletes existing document', async () => {
    const softDelete = vi.fn().mockReturnValue(Effect.succeed(docRow({ deletedAt: new Date() })));
    const logDocumentEvent = vi.fn().mockReturnValue(Effect.void);
    const layer = makeLayers({
      documents: {
        findById: vi.fn().mockReturnValue(Effect.succeed(docRow({ deletedAt: null }))),
        softDelete,
      },
      audit: { logDocumentEvent },
    });
    await runWith(softDeleteDocument({ documentId: 1, actorId: 'user_1' }), layer);
    expect(softDelete).toHaveBeenCalledOnce();
    expect(logDocumentEvent).toHaveBeenCalledWith({
      action: 'delete',
      documentId: 1,
      actorId: 'user_1',
    });
  });
});

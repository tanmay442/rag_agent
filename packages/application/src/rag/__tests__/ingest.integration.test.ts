import { describe, it, expect, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { ingestFile } from '../ingest';
import {
  Documents,
  Chunks,
  Embeddings,
  Hasher,
  PdfParser,
  TextSplitter,
  ValidationError,
  ExternalServiceError,
  type DocumentRow,
} from '@app/domain';
import { expectFailure } from '../../__tests__/effect-test-utils';

function docRow(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 1,
    fileName: 'test.pdf',
    fileHash: 'abc',
    uploadedBy: 'user',
    uploadedAt: new Date(),
    storageKey: null,
    ingestStatus: 'done',
    deletedAt: null,
    ...over,
  };
}

function makeLayers(overrides?: {
  documents?: Partial<Documents.Service>;
  chunks?: Partial<Chunks.Service>;
  embeddings?: Partial<Embeddings.Service>;
  hasher?: Partial<Hasher.Service>;
  pdfParser?: Partial<PdfParser.Service>;
  textSplitter?: Partial<TextSplitter.Service>;
}) {
  const insert = vi.fn().mockReturnValue(Effect.succeed(docRow()));
  const documents: Documents.Service = {
    findByName: vi.fn().mockReturnValue(Effect.succeed(null)),
    findById: vi.fn().mockReturnValue(Effect.succeed(null)),
    setStorageKey: vi.fn().mockReturnValue(Effect.void),
    updateIngestStatus: vi.fn().mockReturnValue(Effect.void),
    insert,
    deleteById: vi.fn().mockReturnValue(Effect.void),
    softDelete: vi.fn().mockReturnValue(Effect.succeed(null)),
    restore: vi.fn().mockReturnValue(Effect.succeed(null)),
    list: vi.fn().mockReturnValue(Effect.succeed({ documents: [], total: 0 })),
    countChunksForDocuments: vi.fn().mockReturnValue(Effect.succeed(new Map())),
    countChunksForAll: vi.fn().mockReturnValue(Effect.succeed(0)),
    ...overrides?.documents,
  };
  const insertMany = vi.fn().mockReturnValue(Effect.void);
  const chunks: Chunks.Service = {
    insertMany,
    searchByVector: vi.fn().mockReturnValue(Effect.succeed([])),
    countForDocuments: vi.fn().mockReturnValue(Effect.succeed(new Map())),
    countForAll: vi.fn().mockReturnValue(Effect.succeed(0)),
    countForDocument: vi.fn().mockReturnValue(Effect.succeed(0)),
    recountAll: vi.fn().mockReturnValue(Effect.succeed([])),
    ...overrides?.chunks,
  };
  const embeddings: Embeddings.Service = {
    embed: vi.fn().mockReturnValue(Effect.succeed([0.1])),
    embedBatch: vi.fn().mockReturnValue(Effect.succeed([[0.1, 0.2, 0.3]])),
    ...overrides?.embeddings,
  };
  const hasher: Hasher.Service = {
    sha256: vi.fn().mockReturnValue(Effect.succeed('abc123')),
    ...overrides?.hasher,
  };
  const pdfParser: PdfParser.Service = {
    extractText: vi.fn().mockReturnValue(Effect.succeed('Sample PDF text content.')),
    ...overrides?.pdfParser,
  };
  const textSplitter: TextSplitter.Service = {
    splitText: vi.fn().mockReturnValue(Effect.succeed(['Sample PDF text content.'])),
    ...overrides?.textSplitter,
  };
  return Layer.mergeAll(
    Layer.succeed(Documents, documents),
    Layer.succeed(Chunks, chunks),
    Layer.succeed(Embeddings, embeddings),
    Layer.succeed(Hasher, hasher),
    Layer.succeed(PdfParser, pdfParser),
    Layer.succeed(TextSplitter, textSplitter),
  );
}

describe('ingestFile', () => {
  it.effect('inserts chunks when embedding succeeds', () =>
    Effect.gen(function* () {
      const layer = makeLayers();
      const result = yield* ingestFile({
        fileName: 'test.pdf',
        buffer: Buffer.from('%PDF-1.4...'),
        uploadedBy: 'user',
      }).pipe(Effect.provide(layer));
      expect(result.status).toBe('inserted');
      expect(result.chunks).toBe(1);
    }),
  );

  it.effect('deletes old document only after new insert succeeds', () =>
    Effect.gen(function* () {
      const deleteById = vi.fn().mockReturnValue(Effect.void);
      const insert = vi.fn().mockReturnValue(Effect.succeed(docRow({ id: 2, fileHash: 'newhash' })));
      const layer = makeLayers({
        documents: {
          findByName: vi.fn().mockReturnValue(Effect.succeed(docRow({ id: 1, fileHash: 'oldhash' }))),
          insert,
          deleteById,
        },
      });
      const result = yield* ingestFile({
        fileName: 'test.pdf',
        buffer: Buffer.from('%PDF-1.4...'),
        uploadedBy: 'user',
      }).pipe(Effect.provide(layer));
      expect(result.status).toBe('updated');
      expect(deleteById).toHaveBeenCalled();
      expect(insert).toHaveBeenCalled();
      expect(deleteById.mock.invocationCallOrder[0]).toBeLessThan(insert.mock.invocationCallOrder[0]);
    }),
  );

  it.effect('returns unchanged when hash matches', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        documents: {
          findByName: vi.fn().mockReturnValue(Effect.succeed(docRow({ id: 1, fileHash: 'abc123' }))),
        },
      });
      const result = yield* ingestFile({
        fileName: 'test.pdf',
        buffer: Buffer.from('data'),
        uploadedBy: 'user',
      }).pipe(Effect.provide(layer));
      expect(result.status).toBe('unchanged');
    }),
  );

  it.effect('returns ValidationError when PDF has no extractable text', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        textSplitter: { splitText: vi.fn().mockReturnValue(Effect.succeed([])) },
      });
      const exit = yield* ingestFile({
        fileName: 'empty.pdf',
        buffer: Buffer.from('data'),
        uploadedBy: 'user',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toMatch(/No extractable text/);
    }),
  );

  it.effect('returns ExternalServiceError when PDF parsing fails', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        pdfParser: {
          extractText: vi.fn().mockReturnValue(Effect.fail(new ExternalServiceError('corrupt file'))),
        },
      });
      const exit = yield* ingestFile({
        fileName: 'bad.pdf',
        buffer: Buffer.from('trash'),
        uploadedBy: 'user',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err.message).toMatch(/corrupt file/);
    }),
  );

  it.effect('returns ExternalServiceError when embedding fails', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        embeddings: {
          embed: vi.fn().mockReturnValue(Effect.succeed([0.1])),
          embedBatch: vi.fn().mockReturnValue(Effect.fail(new ExternalServiceError('API down'))),
        },
      });
      const exit = yield* ingestFile({
        fileName: 'test.pdf',
        buffer: Buffer.from('data'),
        uploadedBy: 'user',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err.message).toMatch(/API down/);
    }),
  );
});

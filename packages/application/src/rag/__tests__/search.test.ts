import { describe, it, expect, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { searchChunks } from '../search';
import { Chunks, Embeddings, ExternalServiceError } from '@app/domain';
import { expectFailure } from '../../__tests__/effect-test-utils';

function makeLayers(overrides?: {
  chunks?: Partial<Chunks.Service>;
  embeddings?: Partial<Embeddings.Service>;
}) {
  const chunks: Chunks.Service = {
    searchByVector: vi
      .fn()
      .mockReturnValue(Effect.succeed([{ content: 'test', similarity: 0.9 }])),
    insertMany: vi.fn().mockReturnValue(Effect.void),
    countForDocuments: vi.fn().mockReturnValue(Effect.succeed(new Map())),
    countForAll: vi.fn().mockReturnValue(Effect.succeed(0)),
    countForDocument: vi.fn().mockReturnValue(Effect.succeed(0)),
    recountAll: vi.fn().mockReturnValue(Effect.succeed([])),
    ...overrides?.chunks,
  };
  const embeddings: Embeddings.Service = {
    embed: vi.fn().mockReturnValue(Effect.succeed([0.1, 0.2, 0.3])),
    embedBatch: vi.fn().mockReturnValue(Effect.succeed([[0.1]])),
    ...overrides?.embeddings,
  };
  return Layer.mergeAll(
    Layer.succeed(Chunks, chunks),
    Layer.succeed(Embeddings, embeddings),
  );
}

describe('searchChunks', () => {
  it.effect('propagates DB errors as ExternalServiceError', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        chunks: {
          searchByVector: vi
            .fn()
            .mockReturnValue(Effect.fail(new ExternalServiceError('connection refused'))),
        },
      });
      const exit = yield* searchChunks('test', {}).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err.message).toMatch(/connection refused/);
    }),
  );

  it.effect('returns results on success', () =>
    Effect.gen(function* () {
      const layer = makeLayers();
      const result = yield* searchChunks('test', {}).pipe(Effect.provide(layer));
      expect(result).toEqual([{ content: 'test', similarity: 0.9 }]);
    }),
  );
});

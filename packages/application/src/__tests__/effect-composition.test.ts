import { describe, it, expect } from '@effect/vitest';
import { Data, Effect, Exit } from 'effect';

// Replaces the former result.test.ts: verifies the Effect composition
// primitives (succeed/fail/map/flatMap) that use-cases now rely on.
class Boom extends Data.TaggedError('Boom')<{ message: string }> {}
class Nope extends Data.TaggedError('Nope')<{ message: string }> {}

describe('Effect composition', () => {
  it.effect('Effect.succeed / Effect.fail', () =>
    Effect.gen(function* () {
      expect(yield* Effect.succeed(42)).toBe(42);
      const exit = yield* Effect.fail(new Boom({ message: 'boom' })).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect('Effect.map / Effect.flatMap', () =>
    Effect.gen(function* () {
      const r = yield* Effect.succeed(2).pipe(
        Effect.map((v) => v + 1),
        Effect.flatMap((v) => Effect.succeed(v * 3)),
      );
      expect(r).toBe(9);
    }),
  );

  it.effect('Effect.gen yields succeed and fail', () =>
    Effect.gen(function* () {
      const ok = yield* Effect.gen(function* () {
        const a = yield* Effect.succeed(1);
        const b = yield* Effect.succeed(2);
        return a + b;
      });
      expect(ok).toBe(3);
      const exit = yield* Effect.fail(new Nope({ message: 'nope' })).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});

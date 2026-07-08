import { describe, it, expect } from 'vitest';
import { Data, Effect } from 'effect';

// Replaces the former result.test.ts: verifies the Effect composition
// primitives (succeed/fail/map/flatMap) that use-cases now rely on.
class Boom extends Data.TaggedError('Boom')<{ message: string }> {}
class Nope extends Data.TaggedError('Nope')<{ message: string }> {}

describe('Effect composition', () => {
  it('Effect.succeed / Effect.fail', async () => {
    await expect(Effect.runPromise(Effect.succeed(42))).resolves.toBe(42);
    await expect(Effect.runPromise(Effect.fail(new Boom({ message: 'boom' })))).rejects.toThrow('boom');
  });

  it('Effect.map / Effect.flatMap', async () => {
    const r = await Effect.runPromise(
      Effect.succeed(2).pipe(
        Effect.map((v) => v + 1),
        Effect.flatMap((v) => Effect.succeed(v * 3)),
      ),
    );
    expect(r).toBe(9);
  });

  it('Effect.gen yields succeed and fail', async () => {
    const ok = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* Effect.succeed(1);
        const b = yield* Effect.succeed(2);
        return a + b;
      }),
    );
    expect(ok).toBe(3);
    await expect(Effect.runPromise(Effect.fail(new Nope({ message: 'nope' })))).rejects.toThrow('nope');
  });
});

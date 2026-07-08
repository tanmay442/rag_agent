// Minimal Effect test helpers. Plain vitest is still used (the full
// @effect/vitest migration is Session 07). These wrap the common
// exit-assertion patterns so use-case tests stay concise.
import { Effect, Exit, Cause, Option, Layer } from 'effect';

/** Assert an exit is a Failure and return its error value. */
export function expectFailure<E>(exit: Exit.Exit<unknown, E>): E {
  if (!Exit.isFailure(exit)) {
    throw new Error('Expected Failure exit but got Success');
  }
  return Option.getOrThrow(Cause.failureOption(exit.cause));
}

/** Assert an exit is a Success and return its value. */
export function expectSuccess<A>(exit: Exit.Exit<A, unknown>): A {
  if (!Exit.isSuccess(exit)) {
    throw new Error('Expected Success exit but got Failure');
  }
  return exit.value;
}

/** Run a use-case Effect against a test layer, returning the value. */
export function runWith<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R>,
): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(layer)));
}

/** Run a use-case Effect against a test layer, returning the Exit. */
export function runExit<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(layer)));
}

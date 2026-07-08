// Minimal Effect test helpers used by @effect/vitest (`it.effect`) tests.
// They operate on the Effect `Exit` value returned by `Effect.exit` rather
// than running the effect themselves — `it.effect` owns the runtime.
import { Exit, Cause, Option } from 'effect';

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

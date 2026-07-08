import type { DomainError } from './errors';
import { ExternalServiceError } from './errors';

export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export function flatMap<T, U, E>(
  r: Result<T, E>,
  fn: (v: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Wrap a Promise into a Result. Rejects are converted to
 *  ExternalServiceError; resolves are wrapped in ok(). */
export async function fromPromise<T>(promise: Promise<T>, message?: string): Promise<Result<T>> {
  try {
    return ok(await promise);
  } catch (e) {
    return err(new ExternalServiceError(message ?? 'Operation failed', e));
  }
}

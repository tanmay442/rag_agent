import { err, ok, type Result } from '@app/domain';
import { ExternalServiceError } from '@app/domain';

/** Wrap an async op that returns a {@link Result} so that any
 *  unhandled throw is converted to an {@link ExternalServiceError}.
 *  Domain errors returned as `err(...)` from the op itself pass
 *  through unchanged. */
export async function wrapServiceCall<T>(
  op: () => Promise<Result<T>>,
  message: string,
): Promise<Result<T>> {
  try {
    return await op();
  } catch (e) {
    return err(new ExternalServiceError(message, e));
  }
}

/** Wrap an async op that returns a raw value into {@link Result}.
 *  Converts any throw into an {@link ExternalServiceError}. */
export async function serviceResult<T>(
  op: () => Promise<T>,
  message: string,
): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch (e) {
    return err(new ExternalServiceError(message, e));
  }
}

/** Clamp and sanitise pagination parameters.  Used by every
 *  admin list handler (documents, users, audit, tickets). */
export function sanitizePagination(
  rawLimit: number | undefined | null,
  rawOffset: number | undefined | null,
  maxLimit: number,
  defaultLimit = 25,
): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(Math.floor(rawLimit ?? defaultLimit), 1), maxLimit),
    offset: Math.max(Math.floor(rawOffset ?? 0), 0),
  };
}

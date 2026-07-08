import {
  ValidationError,
  RateLimitedError,
  type DomainError,
} from '@app/domain';

const SAFE_MESSAGES: Record<string, string> = {
  validation_error: 'Invalid input provided',
  not_found: 'The requested resource was not found',
  forbidden: 'You do not have permission to perform this action',
  unauthorized: 'Please sign in to continue',
  conflict: 'A conflict occurred',
  gone: 'This resource is no longer available',
  rate_limited: 'Too many requests. Please try again later.',
  external_service: 'An external service is temporarily unavailable',
};

export type SafeErrorBody = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

function isDomainError(err: unknown): err is DomainError {
  return (
    typeof err === 'object' &&
    err !== null &&
    '_tag' in err &&
    typeof (err as { _tag: unknown })._tag === 'string'
  );
}

/** Build a client-safe error body from a DomainError.
 *  Never leaks raw internal messages — falls back to a generic
 *  string for codes not in the safe-allowlist. */
function toErrorBody(err: DomainError): SafeErrorBody {
  const body: SafeErrorBody = {
    error: SAFE_MESSAGES[err.code] ?? 'An error occurred',
    code: err.code,
  };
  if (err instanceof ValidationError && err.details) {
    body.details = err.details;
  }
  return body;
}

export function toSafeError(err: unknown): SafeErrorBody {
  if (isDomainError(err)) return toErrorBody(err);
  return { error: 'An unexpected error occurred', code: 'internal_error' };
}

/** Type guard: does an action result represent an error? */
export function isActionError<T>(
  result: T | SafeErrorBody,
): result is SafeErrorBody {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    'code' in result &&
    typeof (result as SafeErrorBody).error === 'string' &&
    typeof (result as SafeErrorBody).code === 'string'
  );
}

/** Map an error or Response to an HTTP error response.
 *  - DomainError → correct status + safe body (includes
 *    ValidationError.details and RateLimitedError Retry-After).
 *  - generic Error → 500 with generic body.
 *  - Response → passthrough.
 *  - anything else (thrown string/null/object) → 500, never 200. */
export function respond(err: unknown): Response {
  if (isDomainError(err)) {
    const headers: Record<string, string> = {};
    if (err instanceof RateLimitedError) {
      headers['Retry-After'] = String(Math.ceil(err.retryAfterMs / 1000));
    }
    return Response.json(toErrorBody(err), { status: err.status, headers });
  }
  if (err instanceof Response) return err;
  return Response.json(
    { error: 'Internal server error', code: 'internal_error' },
    { status: 500 },
  );
}

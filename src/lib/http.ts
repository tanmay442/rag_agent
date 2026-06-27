import { DomainError } from '@app/domain';

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

export function toSafeError(err: unknown): { error: string; code?: string } {
  if (err instanceof DomainError) {
    return { error: SAFE_MESSAGES[err.code] ?? err.message, code: err.code };
  }
  return { error: 'An unexpected error occurred' };
}

export function respond<T>(result: T | Error | DomainError): Response {
  if (result instanceof DomainError) {
    return Response.json(
      { error: SAFE_MESSAGES[result.code] ?? result.message, code: result.code },
      { status: result.status },
    );
  }
  if (result instanceof Error) {
    return Response.json(
      { error: 'Internal server error', code: 'internal_error' },
      { status: 500 },
    );
  }
  if (result instanceof Response) return result;
  return Response.json(result);
}

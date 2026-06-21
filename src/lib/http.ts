// respond(result) — maps a Result<T, DomainError> to a Next.js
// Response with the right status code. Single place where
// DomainError → HTTP status is decided.
import { NextResponse } from 'next/server';
import {
  type DomainError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
  RateLimitedError,
  ExternalServiceError,
} from '@app/domain';

export function respond<T>(result: { ok: true; value: T } | { ok: false; error: DomainError }): Response {
  if (result.ok) {
    return NextResponse.json(result.value);
  }
  return errorResponse(result.error);
}

export function errorResponse(error: DomainError): Response {
  const headers: Record<string, string> = {};
  if (error instanceof RateLimitedError) {
    headers['Retry-After'] = String(Math.ceil(error.retryAfterMs / 1000));
  }
  return NextResponse.json(
    { error: error.code, message: error.message },
    { status: error.status, headers },
  );
}

// Type-narrowing helpers for the route layer.
export { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, GoneError, RateLimitedError, ExternalServiceError };

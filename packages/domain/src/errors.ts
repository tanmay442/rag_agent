// Domain error hierarchy. Application and infrastructure layers
// throw or return these; the route layer maps them to HTTP
// status codes via respond() in src/lib/http.ts.
//
// The class names are the public contract: respond() does
// `instanceof` checks. Adding a new kind of error means
// updating both this file and the respond() mapping.

export abstract class DomainError extends Error {
  abstract readonly code: string;
  /** HTTP status code suggestion. Used by the route layer. */
  abstract readonly status: number;
}

export class ValidationError extends DomainError {
  readonly code = 'validation_error';
  readonly status = 400;
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'unauthorized';
  readonly status = 401;
  constructor(message = 'Unauthorized') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'forbidden';
  readonly status = 403;
  constructor(message = 'Forbidden') {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  readonly status = 404;
  constructor(message: string = 'The requested resource was not found') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';
  readonly status = 409;
  constructor(message: string) {
    super(message);
  }
}

/**
 * 410 Gone: resource was soft-deleted, or its restore window
 * has expired. Used by the document restore flow.
 */
export class GoneError extends DomainError {
  readonly code = 'gone';
  readonly status = 410;
  constructor(message: string) {
    super(message);
  }
}

export class RateLimitedError extends DomainError {
  readonly code = 'rate_limited';
  readonly status = 429;
  constructor(message: string, readonly retryAfterMs: number) {
    super(message);
  }
}

export class ExternalServiceError extends DomainError {
  readonly code = 'external_service';
  readonly status = 502;
  constructor(message: string, readonly cause?: unknown) {
    super(message, { cause });
  }
}

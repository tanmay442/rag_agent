// Domain errors modelled as Effect `Schema.TaggedError` classes.
//
// Each class extends `Error` (via `Schema.TaggedError`), so it carries
// `.stack` natively and `instanceof Error` still works. The `cause`
// field is modelled as an optional schema field (this Effect version
// does not thread a second constructor argument into `Error.cause`).
//
// Discriminate on the `_tag` field (in http.ts and Effect `catchTag`),
// NOT `instanceof DomainError`.
import { Schema } from 'effect';

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class ValidationError extends Schema.TaggedError<ValidationError>()(
  'ValidationError',
  {
    message: Schema.String,
    details: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    ),
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'validation_error' as const;
  readonly status = 400 as const;

  constructor(
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super({ message, details, cause });
  }
}

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  'UnauthorizedError',
  {
    message: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'unauthorized' as const;
  readonly status = 401 as const;

  constructor(message = 'Unauthorized', cause?: unknown) {
    super({ message, cause });
  }
}

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  'ForbiddenError',
  {
    message: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'forbidden' as const;
  readonly status = 403 as const;

  constructor(message = 'Forbidden', cause?: unknown) {
    super({ message, cause });
  }
}

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  'NotFoundError',
  {
    message: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'not_found' as const;
  readonly status = 404 as const;

  constructor(
    message = 'The requested resource was not found',
    cause?: unknown,
  ) {
    super({ message, cause });
  }
}

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class ConflictError extends Schema.TaggedError<ConflictError>()(
  'ConflictError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'conflict' as const;
  readonly status = 409 as const;

  constructor(message: string, cause?: unknown) {
    super({ message, cause });
  }
}

/**
 * 410 Gone: resource was soft-deleted, or its restore window
 * has expired. Used by the document restore flow.
 */
// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class GoneError extends Schema.TaggedError<GoneError>()(
  'GoneError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'gone' as const;
  readonly status = 410 as const;

  constructor(message: string, cause?: unknown) {
    super({ message, cause });
  }
}

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class RateLimitedError extends Schema.TaggedError<RateLimitedError>()(
  'RateLimitedError',
  {
    message: Schema.String,
    retryAfterMs: Schema.Number,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'rate_limited' as const;
  readonly status = 429 as const;

  constructor(message: string, retryAfterMs: number, cause?: unknown) {
    super({ message, retryAfterMs, cause });
  }
}

// @effect-diagnostics-next-line overriddenSchemaConstructor:off
export class ExternalServiceError extends Schema.TaggedError<ExternalServiceError>()(
  'ExternalServiceError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  readonly code = 'external_service' as const;
  readonly status = 502 as const;

  constructor(message: string, cause?: unknown) {
    super({ message, cause });
  }
}

// Unified domain error type (discriminated union of all error tags).
export type DomainError =
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | GoneError
  | RateLimitedError
  | ExternalServiceError;

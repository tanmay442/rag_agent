import { describe, it, expect } from 'vitest';
import { respond, toSafeError, isActionError } from '../http';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  GoneError,
  ConflictError,
  ExternalServiceError,
  RateLimitedError,
} from '@app/domain';

describe('respond', () => {
  it('maps ValidationError to 400 with safe message', async () => {
    const res = respond(new ValidationError('Bad input'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid input provided', code: 'validation_error' });
  });

  it('includes ValidationError.details in the response body', async () => {
    const res = respond(
      new ValidationError('invalid_role', { issues: [{ path: ['role'], message: 'invalid' }] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('validation_error');
    expect(body.details).toEqual({ issues: [{ path: ['role'], message: 'invalid' }] });
  });

  it('maps NotFoundError to 404', async () => {
    const res = respond(new NotFoundError('User not found'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'The requested resource was not found', code: 'not_found' });
  });

  it('maps ForbiddenError to 403', async () => {
    const res = respond(new ForbiddenError('Access denied'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'You do not have permission to perform this action', code: 'forbidden' });
  });

  it('maps RateLimitedError to 429 with Retry-After header', async () => {
    const res = respond(new RateLimitedError('Too fast', 5_000));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    const body = await res.json();
    expect(body.code).toBe('rate_limited');
  });

  it('maps generic Error to 500 with safe message', async () => {
    const res = respond(new Error('internal details'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error', code: 'internal_error' });
  });

  it('maps non-Error thrown values (string) to 500, never 200', async () => {
    const res = respond('something went wrong');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('internal_error');
  });

  it('maps non-Error thrown values (null) to 500, never 200', async () => {
    const res = respond(null);
    expect(res.status).toBe(500);
  });

  it('passes through a Response unchanged', () => {
    const original = new Response('ok', { status: 200 });
    const res = respond(original);
    expect(res).toBe(original);
  });
});

describe('toSafeError', () => {
  it('returns a safe body for DomainError', () => {
    const body = toSafeError(new ValidationError('x'));
    expect(body.code).toBe('validation_error');
    expect(body.error).toBe('Invalid input provided');
  });

  it('returns internal_error for non-DomainError', () => {
    const body = toSafeError(new Error('boom'));
    expect(body.code).toBe('internal_error');
    expect(body.error).toBe('An unexpected error occurred');
  });

  it('returns internal_error for unknown thrown value (string)', () => {
    const body = toSafeError('something broke');
    expect(body.code).toBe('internal_error');
  });

  it('returns internal_error for null', () => {
    const body = toSafeError(null);
    expect(body.code).toBe('internal_error');
  });
});

describe('respond edge cases', () => {
  it('maps ConflictError to 409', async () => {
    const res = respond(new ConflictError('duplicate'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('conflict');
  });

  it('maps GoneError to 410', async () => {
    const res = respond(new GoneError('expired'));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe('gone');
  });

  it('maps ExternalServiceError to 502', async () => {
    const res = respond(new ExternalServiceError('timeout'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('external_service');
  });

  it('maps undefined to 500', async () => {
    const res = respond(undefined);
    expect(res.status).toBe(500);
  });

  it('maps number to 500', async () => {
    const res = respond(42);
    expect(res.status).toBe(500);
  });
});

describe('isActionError', () => {
  it('returns true for valid error body', () => {
    expect(isActionError({ error: 'x', code: 'y' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isActionError(null)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isActionError('error')).toBe(false);
  });

  it('returns false for object missing code', () => {
    expect(isActionError({ error: 'x' })).toBe(false);
  });

  it('returns false for object missing error', () => {
    expect(isActionError({ code: 'x' })).toBe(false);
  });
});

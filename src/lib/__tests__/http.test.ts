import { describe, it, expect } from 'vitest';
import { respond, errorResponse } from '@/lib/http';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
  RateLimitedError,
  ExternalServiceError,
} from '@app/domain';

describe('respond()', () => {
  it('returns 200 with value on ok', async () => {
    const r = respond({ ok: true, value: { hello: 'world' } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hello: 'world' });
  });
  it('maps each DomainError to the right status code', async () => {
    expect(errorResponse(new ValidationError('v')).status).toBe(400);
    expect(errorResponse(new UnauthorizedError()).status).toBe(401);
    expect(errorResponse(new ForbiddenError()).status).toBe(403);
    expect(errorResponse(new NotFoundError('n')).status).toBe(404);
    expect(errorResponse(new ConflictError('c')).status).toBe(409);
    expect(errorResponse(new GoneError('g')).status).toBe(410);
    expect(errorResponse(new RateLimitedError('r', 30_000)).status).toBe(429);
    expect(errorResponse(new ExternalServiceError('x')).status).toBe(502);
  });
  it('sets Retry-After on rate-limited responses', async () => {
    const r = errorResponse(new RateLimitedError('r', 30_000));
    expect(r.headers.get('Retry-After')).toBe('30');
  });
});

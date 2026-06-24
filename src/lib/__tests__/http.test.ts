import { describe, it, expect } from 'vitest';
import { respond } from '../http';
import { ValidationError, NotFoundError, ForbiddenError } from '@app/domain';

describe('respond', () => {
  it('maps DomainError to correct status and code', async () => {
    const res = respond(new ValidationError('Bad input'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid input provided', code: 'validation_error' });
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

  it('maps generic Error to 500 with safe message', async () => {
    const res = respond(new Error('internal details'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error', code: 'internal_error' });
  });

  it('passes through success data as JSON', async () => {
    const res = respond({ data: 'ok' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: 'ok' });
  });
});

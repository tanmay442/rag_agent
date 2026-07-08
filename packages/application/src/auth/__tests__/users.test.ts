import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { Users, Audit, ValidationError, NotFoundError, type UserRow } from '@app/domain';
import { setUserRole } from '../users';
import { expectFailure, runWith, runExit } from '../../__tests__/effect-test-utils';

function user(over: Partial<UserRow> = {}): UserRow {
  return {
    clerkUserId: 'user_1',
    email: 'u@x.com',
    name: null,
    imageUrl: null,
    role: 'admin',
    lastSeenAt: null,
    createdAt: new Date(),
    ...over,
  };
}

function makeLayers(overrides?: {
  users?: Partial<Users.Service>;
  audit?: Partial<Audit.Service>;
}) {
  const users: Users.Service = {
    upsertFromClerk: vi.fn().mockReturnValue(Effect.succeed(user())),
    findByClerkId: vi.fn().mockReturnValue(Effect.succeed(null)),
    findByIds: vi.fn().mockReturnValue(Effect.succeed([])),
    setRole: vi.fn().mockReturnValue(Effect.succeed(user({ role: 'admin' }))),
    touchLastSeen: vi.fn().mockReturnValue(Effect.void),
    list: vi.fn().mockReturnValue(Effect.succeed({ rows: [], total: 0 })),
    countAll: vi.fn().mockReturnValue(Effect.succeed(0)),
    syncClerkRole: vi.fn().mockReturnValue(Effect.void),
    ...overrides?.users,
  };
  const audit: Audit.Service = {
    logDocumentEvent: vi.fn().mockReturnValue(Effect.void),
    logTicketEvent: vi.fn().mockReturnValue(Effect.void),
    list: vi.fn().mockReturnValue(Effect.succeed({ events: [], total: 0 })),
    ...overrides?.audit,
  };
  return Layer.mergeAll(Layer.succeed(Users, users), Layer.succeed(Audit, audit));
}

describe('setUserRole', () => {
  it('logs a role_change ticket audit event', async () => {
    const logTicketEvent = vi.fn().mockReturnValue(Effect.void);
    const layer = makeLayers({ audit: { logTicketEvent } });
    await runWith(
      setUserRole({ clerkUserId: 'user_1', role: 'admin', actorId: 'actor_1' }),
      layer,
    );
    expect(logTicketEvent).toHaveBeenCalledWith({
      action: 'role_change',
      ticketId: 'user:user_1',
      actorId: 'actor_1',
    });
  });

  it('returns ValidationError for invalid role', async () => {
    const layer = makeLayers();
    const exit = await runExit(
      setUserRole({ clerkUserId: 'user_1', role: 'superadmin' as 'admin', actorId: 'actor_1' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toMatch(/Invalid role/);
  });

  it('returns NotFoundError when user does not exist', async () => {
    const layer = makeLayers({
      users: { setRole: vi.fn().mockReturnValue(Effect.succeed(null)) },
    });
    const exit = await runExit(
      setUserRole({ clerkUserId: 'nonexistent', role: 'admin', actorId: 'actor_1' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toMatch(/User not found/);
  });
});

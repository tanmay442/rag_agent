import { describe, it, expect, vi } from 'vitest';
import { setUserRole } from '../users';
import type { UserRepository, AuditLog } from '../../ports/index';

function makeDeps(overrides?: {
  users?: Partial<UserRepository>;
  audit?: Partial<AuditLog>;
}) {
  const logTicketEvent = vi.fn().mockResolvedValue(undefined);
  return {
    users: {
      upsertFromClerk: vi.fn(),
      findByClerkId: vi.fn(),
      setRole: vi.fn().mockResolvedValue({ clerkUserId: 'user_1', role: 'admin' }),
      touchLastSeen: vi.fn(),
      list: vi.fn(),
      countAll: vi.fn(),
      syncClerkRole: vi.fn().mockResolvedValue(undefined),
      ...overrides?.users,
    } as UserRepository,
    audit: {
      logDocumentEvent: vi.fn(),
      logTicketEvent,
      list: vi.fn(),
      ...overrides?.audit,
    } as AuditLog,
  };
}

describe('setUserRole', () => {
  it('logs a role_change ticket audit event', async () => {
    const logTicketEvent = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ audit: { logTicketEvent } });
    const result = await setUserRole(
      { clerkUserId: 'user_1', role: 'admin', actorId: 'actor_1' },
      deps as Parameters<typeof setUserRole>[1],
    );
    expect(result.ok).toBe(true);
    expect(logTicketEvent).toHaveBeenCalledWith({
      action: 'role_change',
      ticketId: 'user:user_1',
      actorId: 'actor_1',
    });
  });

  it('returns ValidationError for invalid role', async () => {
    const deps = makeDeps();
    const result = await setUserRole(
      { clerkUserId: 'user_1', role: 'superadmin' as 'admin', actorId: 'actor_1' },
      deps as Parameters<typeof setUserRole>[1],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Invalid role/);
    }
  });

  it('returns NotFoundError when user does not exist', async () => {
    const deps = makeDeps({
      users: { setRole: vi.fn().mockResolvedValue(null) },
    });
    const result = await setUserRole(
      { clerkUserId: 'nonexistent', role: 'admin', actorId: 'actor_1' },
      deps as Parameters<typeof setUserRole>[1],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/User not found/);
    }
  });
});

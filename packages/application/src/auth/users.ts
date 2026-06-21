// Use-case: list users / set role / get / touch last seen.
// Source: src/lib/auth/users.ts (listUsers, setUserRole, getUserByClerkId, touchLastSeen).
import { err, ok, type Result, NotFoundError, ValidationError } from '@app/domain';
import type { UserRepository } from '../ports/index';
import type { AuditLog } from '../ports/index';

export async function listUsers(
  input: { search?: string; limit?: number; offset?: number },
  deps: { users: UserRepository },
): Promise<Result<{ users: Array<{ clerkUserId: string; email: string; name: string | null; role: string }>; total: number }>> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const r = await deps.users.list({ search: input.search, limit, offset });
  return ok({ users: r.rows as any, total: r.total });
}

export async function setUserRole(
  input: { clerkUserId: string; role: 'admin' | 'user'; actorId: string },
  deps: { users: UserRepository; audit: AuditLog },
): Promise<Result<{ user: { clerkUserId: string; role: string } }>> {
  if (input.role !== 'admin' && input.role !== 'user') {
    return err(new ValidationError(`Invalid role: ${input.role}`));
  }
  const row = await deps.users.setRole(input.clerkUserId, input.role);
  if (!row) return err(new NotFoundError(`User not found: ${input.clerkUserId}`));
  void deps.users.syncClerkRole(input.clerkUserId, input.role).catch(() => {});
  void deps.audit.logTicketEvent({
    action: 'impersonation',
    ticketId: `user:${input.clerkUserId}`,
    actorId: input.actorId,
  }).catch(() => {});
  return ok({ user: { clerkUserId: row.clerkUserId, role: row.role } });
}

export async function getUserByClerkId(
  clerkUserId: string,
  deps: { users: UserRepository },
): Promise<Result<{ user: { clerkUserId: string; email: string; name: string | null; role: string } | null }>> {
  const u = await deps.users.findByClerkId(clerkUserId);
  return ok({ user: u ? { clerkUserId: u.clerkUserId, email: u.email, name: u.name, role: u.role } : null });
}

export async function touchLastSeen(
  clerkUserId: string,
  deps: { users: UserRepository },
): Promise<Result<void>> {
  await deps.users.touchLastSeen(clerkUserId);
  return ok(undefined);
}

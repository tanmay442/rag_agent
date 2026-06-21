// Use-case: upsert a local user row from a Clerk identity.
// Honours ADMIN_EMAILS from env for the bootstrap path.
// Source: src/lib/auth/users.ts (syncUserFromClerk).
import { ok, type Result } from '@app/domain';
import type { UserRepository } from '../ports/index';

export interface SyncUserInput {
  clerkUserId: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  requestedRole?: 'admin' | 'user' | null;
  isAdminBootstrapEmail: boolean;
}

export async function syncUser(
  input: SyncUserInput,
  deps: { users: UserRepository },
): Promise<Result<{ id: string; email: string; role: 'admin' | 'user' }>> {
  const role =
    input.requestedRole ??
    (input.isAdminBootstrapEmail ? 'admin' : 'user');
  const row = await deps.users.upsertFromClerk({
    clerkUserId: input.clerkUserId,
    email: input.email,
    name: input.name ?? null,
    imageUrl: input.imageUrl ?? null,
    role,
  });
  // Mirror the role into Clerk (fire-and-forget).
  if (row.role === 'admin') {
    void deps.users.syncClerkRole(input.clerkUserId, 'admin').catch(() => {
      /* noop — DB is source of truth */
    });
  }
  return ok({ id: row.clerkUserId, email: row.email, role: row.role as 'admin' | 'user' });
}

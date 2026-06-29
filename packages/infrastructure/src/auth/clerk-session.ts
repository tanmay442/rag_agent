// Clerk session adapter. Wraps the @clerk/nextjs/server
// auth() / currentUser() / clerkClient() calls so the
// application layer only sees the SessionStore port.
//
// TODO: Dual role resolution — this adapter resolves roles
// solely from Clerk publicMetadata, while other code paths
// may resolve roles from the DB users table. This inconsistency
// can cause stale or conflicting role values. A proper fix
// requires a single source-of-truth for role resolution.
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import type { SessionStore } from '@app/application/ports';

export const clerkSessionStore: SessionStore = {
  async getSession() {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    if (!user) return null;
    return {
      user: {
        id: userId,
        email: user.emailAddresses[0]?.emailAddress ?? '',
        name: user.fullName ?? user.firstName ?? user.username ?? 'User',
        imageUrl: user.imageUrl ?? null,
        role: ((user.publicMetadata as { role?: string } | null)?.role === 'admin'
          ? 'admin'
          : 'user'),
      },
    };
  },
};

export { clerkClient };

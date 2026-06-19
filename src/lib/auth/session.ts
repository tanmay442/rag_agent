import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getUserByClerkId, syncUserFromClerk, isAdminEmail, type AppRole } from './users';

// Existing modules import `DEFAULT_USER_ID` and `getSession()`; we keep
// the same shape so they don't have to be rewritten. New code should call
// `getAppSession()` which returns Clerk-backed data.

export const DEFAULT_USER_ID = 'anonymous';

export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: AppRole;
  };
}

export interface AppSessionFull {
  user: {
    id: string;
    email: string;
    name: string;
    imageUrl: string | null;
    role: AppRole;
  };
}

export async function getAppSession(): Promise<AppSessionFull | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  if (!user) return null;
  const email = user.emailAddresses[0]?.emailAddress ?? '';
  // Bootstrap: if the email is in ADMIN_EMAILS and we don't yet have a
  // local row, mark them admin. This is the one place we use ADMIN_EMAILS.
  let local = await getUserByClerkId(userId);
  if (!local) {
    const clerkRole = parseClerkRole(
      (user.publicMetadata as { role?: unknown } | null)?.role,
    );
    local = await syncUserFromClerk({
      clerkUserId: userId,
      email,
      name: user.fullName ?? user.firstName ?? user.username ?? null,
      imageUrl: user.imageUrl ?? null,
      clerkRole: clerkRole ?? (isAdminEmail(email) ? 'admin' : 'user'),
    });
  } else if (isAdminEmail(email) && local.role !== 'admin') {
    // Re-bootstrap: if the user signed in with an admin-bootstrap email
    // but we still have them at 'user', promote.
    local = await syncUserFromClerk({
      clerkUserId: userId,
      email,
      name: local.name,
      imageUrl: local.imageUrl,
      clerkRole: 'admin',
    });
  }
  return {
    user: {
      id: userId,
      email,
      name: local.name ?? user.fullName ?? user.firstName ?? 'User',
      imageUrl: local.imageUrl ?? user.imageUrl ?? null,
      role: local.role as AppRole,
    },
  };
}

// Legacy entry point used by ingest/chat code that pre-dates Clerk.
// Returns the placeholder identity if there is no signed-in user.
export async function getSession(): Promise<AppSession> {
  const s = await getAppSession();
  if (!s) {
    return {
      user: {
        id: DEFAULT_USER_ID,
        email: 'anonymous@example.com',
        name: 'Anonymous',
        role: 'user',
      },
    };
  }
  return {
    user: {
      id: s.user.id,
      email: s.user.email,
      name: s.user.name,
      role: s.user.role,
    },
  };
}

function parseClerkRole(value: unknown): AppRole | null {
  if (value === 'admin' || value === 'user') return value;
  return null;
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = 'Forbidden') {
    super(message);
  }
}

export async function requireAdmin(): Promise<AppSessionFull> {
  const session = await getAppSession();
  if (!session) {
    throw new ForbiddenError('Not signed in');
  }
  if (session.user.role !== 'admin') {
    throw new ForbiddenError('Admin role required');
  }
  return session;
}

export async function requireSession(): Promise<AppSessionFull> {
  const session = await getAppSession();
  if (!session) {
    throw new ForbiddenError('Not signed in');
  }
  return session;
}

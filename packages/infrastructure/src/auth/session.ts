import { auth, currentUser } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { ForbiddenError, UnauthorizedError } from '@app/domain';

export type AppRole = 'admin' | 'user';

function computeAdminEmails(): readonly string[] {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((e) => e && EMAIL_RE.test(e));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return computeAdminEmails().includes(email.toLowerCase());
}

async function upsertUser(input: {
  clerkUserId: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  role: AppRole;
}): Promise<{ clerkUserId: string; email: string; name: string | null; imageUrl: string | null; role: string; lastSeenAt: Date | null; createdAt: Date }> {
  const [row] = await db
    .insert(users)
    .values(input)
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: input.email,
        name: input.name ?? null,
        imageUrl: input.imageUrl ?? null,
        role: input.role,
      },
    })
    .returning();
  if (!row) throw new Error('Failed to upsert user');
  return row as { clerkUserId: string; email: string; name: string | null; imageUrl: string | null; role: string; lastSeenAt: Date | null; createdAt: Date };
}

async function findUserByClerkId(clerkUserId: string) {
  const row = await db.query.users.findFirst({ where: eq(users.clerkUserId, clerkUserId) });
  return (row as { clerkUserId: string; email: string; name: string | null; imageUrl: string | null; role: string; lastSeenAt: Date | null; createdAt: Date } | undefined) ?? null;
}

async function touchLastSeen(clerkUserId: string): Promise<void> {
  const user = await findUserByClerkId(clerkUserId);
  if (user?.lastSeenAt && Date.now() - user.lastSeenAt.getTime() < 60_000) {
    return;
  }
  await db.update(users).set({ lastSeenAt: sql`now()` }).where(eq(users.clerkUserId, clerkUserId));
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
  let local = await findUserByClerkId(userId);
  if (!local) {
    const clerkRole = parseClerkRole(
      (user.publicMetadata as { role?: unknown } | null)?.role,
    );
    local = await upsertUser({
      clerkUserId: userId,
      email,
      name: user.fullName ?? user.firstName ?? user.username ?? null,
      imageUrl: user.imageUrl ?? null,
      role: clerkRole ?? (isAdminEmail(email) ? 'admin' : 'user'),
    });
  } else if (isAdminEmail(email) && local.role !== 'admin') {
    local = await upsertUser({
      clerkUserId: userId,
      email,
      name: local.name,
      imageUrl: local.imageUrl,
      role: 'admin',
    });
    // Sync the promoted role back to Clerk so the JWT carries the correct role.
    const { clerkClient } = await import('./clerk-session');
    const client = await clerkClient();
    client.users.updateUserMetadata(userId, { publicMetadata: { role: 'admin' } }).catch(() => {});
  }
  void touchLastSeen(userId).catch(() => {});
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

function parseClerkRole(value: unknown): AppRole | null {
  if (value === 'admin' || value === 'user') return value;
  return null;
}

export async function requireAdmin(): Promise<AppSessionFull> {
  const session = await getAppSession();
  if (!session) throw new UnauthorizedError('Not signed in');
  if (session.user.role !== 'admin') throw new ForbiddenError('Admin role required');
  return session;
}

export async function requireSession(): Promise<AppSessionFull> {
  const session = await getAppSession();
  if (!session) throw new UnauthorizedError('Not signed in');
  return session;
}

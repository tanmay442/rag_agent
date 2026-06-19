import 'server-only';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, type User } from '@/lib/db/schema';
import { logTicketEvent } from './audit';

export type AppRole = 'admin' | 'user';

export type LocalUser = User;

function computeAdminEmails(): readonly string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
export function getAdminEmails(): readonly string[] {
  return computeAdminEmails();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

// Upsert a local row from a Clerk user object. `requestedRole` is only
// honored if the user is in the admin bootstrap list and currently has no
// role on Clerk — otherwise we mirror Clerk's `publicMetadata.role`.
export async function syncUserFromClerk(input: {
  clerkUserId: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  clerkRole?: AppRole | null;
}): Promise<LocalUser> {
  const role: AppRole =
    input.clerkRole ??
    (isAdminEmail(input.email) ? 'admin' : 'user');

  const [row] = await db
    .insert(users)
    .values({
      clerkUserId: input.clerkUserId,
      email: input.email,
      name: input.name ?? null,
      imageUrl: input.imageUrl ?? null,
      role,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: input.email,
        name: input.name ?? null,
        imageUrl: input.imageUrl ?? null,
        role,
      },
    })
    .returning();
  if (!row) {
    throw new Error('Failed to upsert user row');
  }
  // Mirror the role into Clerk's publicMetadata so that the next session
  // JWT (after the session-token template is configured) carries it.
  // Fire-and-forget — the local DB row is the source of truth that
  // proxy.ts consults in the meantime.
  if (row.role === 'admin') {
    void syncClerkRole(input.clerkUserId, 'admin').catch((err) => {
      console.error('syncUserFromClerk: Clerk role sync failed', err);
    });
  }
  return row as LocalUser;
}

export async function getUserByClerkId(
  clerkUserId: string,
): Promise<LocalUser | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
  return (row as LocalUser | undefined) ?? null;
}

export async function touchLastSeen(clerkUserId: string): Promise<void> {
  await db
    .update(users)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(users.clerkUserId, clerkUserId));
}

export interface ListUsersParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListUsersResult {
  users: LocalUser[];
  total: number;
}

export async function listUsers(
  params: ListUsersParams = {},
): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim();

  const where = search
    ? or(
        ilike(users.email, `%${search.replace(/[%_]/g, '\\$&')}%`),
        ilike(users.name, `%${search.replace(/[%_]/g, '\\$&')}%`),
      )
    : undefined;

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(users.createdAt)
    .limit(limit)
    .offset(offset);
  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where);
  return {
    users: rows as LocalUser[],
    total: totalRow[0]?.count ?? 0,
  };
}

export async function setUserRole(
  clerkUserId: string,
  role: AppRole,
  actorId: string,
): Promise<LocalUser> {
  if (role !== 'admin' && role !== 'user') {
    throw new Error(`Invalid role: ${role}`);
  }
  const [row] = await db
    .update(users)
    .set({ role })
    .where(eq(users.clerkUserId, clerkUserId))
    .returning();
  if (!row) {
    throw new Error(`User not found: ${clerkUserId}`);
  }
  void syncClerkRole(clerkUserId, role).catch((err) => {
    console.error('setUserRole: Clerk sync failed', err);
  });
  void logTicketEvent({
    action: 'impersonation',
    ticketId: `user:${clerkUserId}`,
    actorId,
  }).catch((err) => {
    console.error('setUserRole: audit log failed', err);
  });
  return row as LocalUser;
}

async function syncClerkRole(
  clerkUserId: string,
  role: AppRole,
): Promise<void> {
  const { clerkClient } = await import('@clerk/nextjs/server');
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { role },
  });
}

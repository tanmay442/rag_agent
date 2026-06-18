import 'server-only';

// Returns true if the given email is in the ADMIN_EMAILS allowlist.
// ADMIN_EMAILS is a comma-separated list of emails that should be
// auto-promoted to the admin role when they sign up.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/**
 * Promote a user to admin in the Neon Auth users table.
 *
 * We use the underlying pg.Pool to issue a direct SQL update because the
 * Better Auth SDK doesn't expose a "set role" verb on the public API
 * surface. The neon_auth schema's `user` table has a `role` column when
 * roles are enabled in the Neon Auth dashboard.
 */
export async function promoteToAdmin(args: {
  userId: string;
  email: string;
}): Promise<void> {
  if (!isAdminEmail(args.email)) return;
  // Lazy-import the pool so this module stays import-safe in test envs
  // that don't need the network.
  const { db } = await import('@/lib/db/client');
  const { sql } = await import('drizzle-orm');
  await db.execute(
    sql`UPDATE neon_auth.user SET role = 'admin' WHERE id = ${args.userId}`,
  );
}

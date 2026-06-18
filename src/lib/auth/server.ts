import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
if (!baseUrl) {
  throw new Error('NEON_AUTH_BASE_URL is not set');
}
if (!cookieSecret || cookieSecret.length < 32) {
  throw new Error(
    'NEON_AUTH_COOKIE_SECRET must be at least 32 characters long. Generate one with: openssl rand -base64 32',
  );
}

// Singleton across module reloads in dev.
declare global {
  var __ragAgentAuth: ReturnType<typeof createNeonAuth> | undefined;
}

export const auth =
  globalThis.__ragAgentAuth ??
  createNeonAuth({
    baseUrl,
    cookies: {
      secret: cookieSecret,
    },
  });
if (process.env.NODE_ENV !== 'production') {
  globalThis.__ragAgentAuth = auth;
}

export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
}

/**
 * Returns the active session, or null when the visitor is not signed in.
 * Wraps the auth SDK so call sites don't need to remember the return shape.
 */
export async function getSession(): Promise<AppSession | null> {
  const { data } = await auth.getSession();
  if (!data?.user) return null;
  // Neon Auth embeds the user's role on the `user` object when it is set by
  // an admin. Default to 'user' for everyone else.
  const role = (data.user as { role?: 'admin' | 'user' }).role ?? 'user';
  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name ?? data.user.email,
      role,
    },
    session: {
      id: data.session.id,
      userId: data.session.userId,
      expiresAt: typeof data.session.expiresAt === 'string' ? data.session.expiresAt : data.session.expiresAt.toISOString(),
    },
  };
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireAdmin(): Promise<AppSession> {
  const session = await requireSession();
  if (session.user.role !== 'admin') {
    throw new Error('Forbidden: admin role required');
  }
  return session;
}

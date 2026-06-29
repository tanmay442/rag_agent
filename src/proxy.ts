import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Public routes: landing, sign-in / sign-up, Next internals.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
]);

// Require signed-in user. Clerk's `auth.protect()` redirects to sign-in.
const isProtectedRoute = createRouteMatcher([
  '/chat(.*)',
  '/admin(.*)',
  '/api/chat(.*)',
  '/api/admin(.*)',
]);

// Admin-only routes. Reads role from Clerk JWT (publicMetadata -> metadata).
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

async function resolveRole(
  userId: string,
  sessionClaims: unknown,
): Promise<'admin' | 'user'> {
  if (sessionClaims && typeof sessionClaims === 'object') {
    // Fast path: read role from JWT session token template.
    const claims = sessionClaims as
      | { metadata?: { role?: unknown } }
      | undefined;
    const fromClaims = claims?.metadata?.role;
    if (fromClaims === 'admin' || fromClaims === 'user') {
      return fromClaims;
    }
  }
  // Fallback: read role from Clerk Backend SDK (Edge-compatible).
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const role = (user.publicMetadata as { role?: unknown } | null)?.role;
    if (role === 'admin' || role === 'user') return role;
  } catch (err) {
    console.error('proxy: failed to read user from Clerk', err);
  }
  return 'user';
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();
  if (isProtectedRoute(req)) {
    const { userId, sessionClaims } = await auth.protect();
    if (isAdminRoute(req)) {
      const role = await resolveRole(userId, sessionClaims);
      if (role !== 'admin') {
        return NextResponse.redirect(new URL('/chat', req.url));
      }
    }
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets and the Next.js internals.
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

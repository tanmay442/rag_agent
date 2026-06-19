import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Public routes: landing, sign-in / sign-up, Next internals, favicon,
// and any static asset.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/favicon.ico',
]);

// Routes that require a signed-in user. Clerk's `auth.protect()` will
// redirect to the sign-in page if the user is signed out.
const isProtectedRoute = createRouteMatcher([
  '/chat(.*)',
  '/admin(.*)',
  '/api/chat(.*)',
  '/api/admin(.*)',
]);

// Admin-only routes. We read the role from Clerk's sessionClaims.metadata
// (Clerk automatically maps publicMetadata to `metadata` in the JWT).
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

async function resolveRole(
  userId: string,
  sessionClaims: unknown,
): Promise<'admin' | 'user'> {
  // 1. The Clerk session token template maps publicMetadata -> metadata
  //    in the JWT. If the template is configured and the user has a role
  //    set on publicMetadata, this is the cheap path.
  const claims = sessionClaims as
    | { metadata?: { role?: unknown } }
    | undefined;
  const fromClaims = claims?.metadata?.role;
  if (fromClaims === 'admin' || fromClaims === 'user') {
    return fromClaims;
  }
  // 2. Fallback: read the role directly from Clerk via the Backend SDK.
  //    The proxy runs in the Edge runtime; clerkClient works there. This
  //    keeps admin gating functional even when the session-token template
  //    hasn't been configured yet.
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
  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets and the Next.js internals.
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

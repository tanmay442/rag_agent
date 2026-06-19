import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();
  if (isProtectedRoute(req)) {
    const { sessionClaims } = await auth.protect();
    if (isAdminRoute(req)) {
      const claims = sessionClaims as
        | { metadata?: { role?: string } }
        | undefined;
      const role = claims?.metadata?.role ?? 'user';
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

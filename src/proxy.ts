import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

// The Neon Auth SDK ships a proxy/middleware function that handles cookie
// session validation. We wrap it so we can layer role-based access control
// for /admin/* on top of the default login redirect.
const neonProxy = auth.middleware({ loginUrl: '/login' });

const ADMIN_PATH = /^\/admin(?:\/|$)/;
const PUBLIC_PATHS = new Set<string>(['/', '/login', '/signup']);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // 0. Public paths skip auth entirely.
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // 1. Let the SDK do its session-refresh + redirect-when-anonymous work.
  const res = await neonProxy(request);
  if (res.status >= 300 && res.status < 400) {
    return res;
  }

  // 2. Admin RBAC: anonymous / non-admin traffic to /admin is bounced.
  if (ADMIN_PATH.test(request.nextUrl.pathname)) {
    const { data: session } = await auth.getSession();
    const role = (session?.user as { role?: 'admin' | 'user' } | undefined)?.role;
    if (!session?.user || role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/chat';
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    // Run on everything except _next, the auth API itself, and static files.
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};

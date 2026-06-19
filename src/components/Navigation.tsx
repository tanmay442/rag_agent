import Link from 'next/link';
import { SignInButton, UserButton } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';

export async function Navigation() {
  const { userId, sessionClaims } = await auth();
  const user = userId ? await currentUser() : null;
  const claims = sessionClaims as
    | { metadata?: { role?: string } }
    | undefined;
  const role = claims?.metadata?.role;
  const isAdmin = role === 'admin';
  return (
    <nav className="flex w-full items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="text-lg font-semibold">
        RAG Support
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/chat" className="hover:underline" data-testid="nav-chat">
          Chat
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className="hover:underline"
            data-testid="nav-admin"
          >
            Admin
          </Link>
        ) : null}
        {userId ? (
          <span className="flex items-center gap-2" data-testid="nav-user-button">
            <UserButton />
          </span>
        ) : (
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
              data-testid="nav-sign-in"
            >
              Sign in
            </button>
          </SignInButton>
        )}
        {user ? (
          <span className="text-xs text-zinc-500" data-testid="nav-user-name">
            {user.firstName ?? user.fullName ?? user.username}
          </span>
        ) : null}
      </div>
    </nav>
  );
}

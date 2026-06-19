import Link from 'next/link';
import { SignInButton, UserButton } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { MobileNavSheet, type NavItem } from './MobileNavSheet';

export async function Navigation() {
  const { userId, sessionClaims } = await auth();
  const user = userId ? await currentUser() : null;
  const claims = sessionClaims as
    | { metadata?: { role?: string } }
    | undefined;
  const roleFromClaims = claims?.metadata?.role;
  const roleFromClerk = (user?.publicMetadata as
    | { role?: string }
    | null)?.role;
  const role = roleFromClaims ?? roleFromClerk;
  const isAdmin = role === 'admin';

  const navItems: NavItem[] = [
    { href: '/chat', label: 'Chat', testId: 'nav-mobile-chat' },
  ];
  if (isAdmin) {
    navItems.push({ href: '/admin', label: 'Admin', testId: 'nav-mobile-admin' });
  }

  return (
    <MobileNavSheet
      brand="RAG Support"
      items={navItems}
      triggerTestId="nav-hamburger"
      sheetTestId="nav-mobile-sheet"
    >
      <nav className="sticky top-0 z-40 flex w-full items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--background)]/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M4 4h16v12H7l-3 4V4z" />
            </svg>
          </span>
          RAG Support
        </Link>
        <div className="flex items-center gap-1 sm:gap-3 text-sm">
          <Link
            href="/chat"
            className="rounded-xl px-3 py-1.5 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            data-testid="nav-chat"
          >
            Chat
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className="rounded-xl px-3 py-1.5 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              data-testid="nav-admin"
            >
              Admin
            </Link>
          ) : null}
          {userId ? (
            <span
              className="ml-1 flex items-center"
              data-testid="nav-user-button"
            >
              <UserButton />
            </span>
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="ml-1 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
                data-testid="nav-sign-in"
              >
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </nav>
    </MobileNavSheet>
  );
}

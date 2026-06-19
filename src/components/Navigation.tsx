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
      <nav
        className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--background)]/85 backdrop-blur-md"
        data-testid="nav"
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--foreground)]"
            data-testid="nav-brand"
          >
            <span
              aria-hidden
              className="relative inline-flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/25"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M4 4h16v12H7l-3 4V4z" />
              </svg>
            </span>
            <span>RAG Support</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/chat"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              data-testid="nav-chat"
            >
              Chat
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                data-testid="nav-admin"
              >
                Admin
              </Link>
            ) : null}

            <span className="mx-2 hidden h-5 w-px bg-[var(--border-subtle)] sm:inline-block" />

            {userId ? (
              <span
                className="flex items-center"
                data-testid="nav-user-button"
              >
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'h-8 w-8',
                    },
                  }}
                />
              </span>
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-3.5 text-sm font-medium text-[var(--accent-foreground)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]"
                  data-testid="nav-sign-in"
                >
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </nav>
    </MobileNavSheet>
  );
}

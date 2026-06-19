'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';

export interface NavItem {
  href: string;
  label: string;
  testId?: string;
}

/**
 * MobileNavSheet — a small client component that renders a sticky top bar
 * with a hamburger button (visible below `md`) and a slide-down sheet of
 * links. The desktop horizontal nav and the admin sidebar are passed in
 * as `children` and rendered unchanged on `md+`. Below `md` the children
 * are hidden and the hamburger takes over.
 *
 * Closes on: backdrop click, link click, Escape. Locks body scroll while
 * open. Animates with Tailwind transitions only — no JS animation lib.
 */
export function MobileNavSheet({
  brand,
  items,
  triggerTestId,
  sheetTestId,
  children,
}: {
  brand: string;
  items: NavItem[];
  triggerTestId: string;
  sheetTestId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open so the page behind doesn't
  // move when the user swipes.
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Mobile-only top bar. Hidden on `md+`. */}
      <div className="sticky top-0 z-40 flex w-full items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--background)]/80 px-4 py-3 backdrop-blur-md md:hidden">
        <span className="text-base font-semibold tracking-tight">
          {brand}
        </span>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls={sheetTestId}
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)]"
          data-testid={triggerTestId}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </div>

      {/* Desktop content (unchanged nav / sidebar). */}
      <div className="hidden md:block">{children}</div>

      {/* Mobile sheet + backdrop. */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" data-testid={sheetTestId}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav
            id={sheetTestId}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl transition-transform duration-200"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                {brand}
              </span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            </div>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
                data-testid={item.testId}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}

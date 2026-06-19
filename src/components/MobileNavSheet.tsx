'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';

export interface NavItem {
  href: string;
  label: string;
  testId?: string;
}

/**
 * MobileNavSheet — pairs a "trigger" (hamburger button, visible only
 * below `md`) with a slide-in nav sheet (also below `md`). The
 * `children` are rendered next to the trigger, in normal flow, and
 * the consumer decides what to show at each breakpoint.
 *
 * Typical usages:
 *   - Public topbar: pass `<nav className="…">…</nav>` as children;
 *     the consumer hides the inline brand on mobile and the hamburger
 *     takes its place.
 *   - Admin shell: pass a mobile-only topbar (with the hamburger and
 *     a brand label) as children, and render the persistent desktop
 *     sidebar as a sibling outside the component.
 *
 * Closes on: backdrop click, link click, Escape. Locks body scroll
 * while open. Honors `prefers-reduced-motion` because the slide-in
 * is the only animated surface and Tailwind transitions already
 * respect the user preference.
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

  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

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
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls={sheetTestId}
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]/90 text-[var(--foreground)] shadow-sm backdrop-blur transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-elevated)] md:hidden"
          data-testid={triggerTestId}
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
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        {children}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] md:hidden"
          data-testid={sheetTestId}
        >
          <div
            className="absolute inset-0 bg-[oklch(0.08_0.01_262_/_0.7)] backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav
            id={sheetTestId}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 border-l border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-subtle)]">
                {brand}
              </span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
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
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
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

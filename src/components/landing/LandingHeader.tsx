import Link from 'next/link';
import { GithubIcon } from '@/components/icons/GithubIcon';

/**
 * Landing-page-only header. Intentionally minimal: brand on the
 * left, "Personal Next.js project" + GitHub link on the right.
 * No nav links, no auth controls - the rest of the marketing
 * surface (the card on the right) carries the primary CTAs.
 */
export function LandingHeader() {
  return (
    <header
      className="sticky top-0 z-30 w-full border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md"
      data-testid="landing-header"
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--foreground)]"
          data-testid="landing-header-brand"
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
              aria-hidden
            >
              <path d="M4 4h16v12H7l-3 4V4z" />
            </svg>
          </span>
          <span>RAG Support</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden text-xs text-[var(--foreground-muted)] sm:inline">
            Personal Next.js project
          </span>
          <a
            href="https://github.com/tanmay442/rag_agent"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            data-testid="landing-header-github"
          >
            <GithubIcon className="h-3.5 w-3.5" aria-hidden />
            <span>tanmay442</span>
          </a>
        </div>
      </div>
    </header>
  );
}

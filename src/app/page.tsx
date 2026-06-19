import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';

export default async function Home() {
  const { userId } = await auth();
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16 sm:py-24">
      {/* Soft top wash (defined on <body>) is the base. A second,
          larger accent glow sits behind the hero; together they
          read as depth rather than as a hero gradient. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at center, var(--accent) 0%, transparent 65%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage:
              'radial-gradient(ellipse at center, black 30%, transparent 70%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          }}
        />
      </div>

      <main className="flex w-full max-w-3xl flex-col gap-8">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)]/70 px-3 py-1 text-xs font-medium text-[var(--foreground-muted)] backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          </span>
          Serverless · Cited · Escalation-ready
        </span>

        <h1 className="text-balance text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-[3.25rem] sm:leading-[1.05]">
          Serverless AI customer support.
        </h1>

        <p className="max-w-2xl text-pretty text-base leading-relaxed text-[var(--foreground-muted)] sm:text-lg">
          Ask questions about company documentation, get cited answers, and
          escalate to a human with one click.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/chat"
            className="group inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-foreground)] shadow-lg shadow-[var(--accent)]/25 transition-all duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] hover:shadow-xl hover:shadow-[var(--accent)]/30 active:translate-y-0"
            data-testid="home-open-chat"
          >
            Open chat
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-hover:translate-x-0.5"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          {!userId ? (
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-2.5 text-sm font-medium text-[var(--foreground)] backdrop-blur transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:bg-[var(--surface-elevated)]"
                data-testid="home-sign-in"
              >
                Sign in
              </button>
            </SignInButton>
          ) : null}
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Documentation-grounded', value: 'RAG with citations' },
            { label: 'Multi-step agent', value: 'Clarify → search → answer' },
            { label: 'Human escalation', value: 'One-click support tickets' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]/40 p-4 backdrop-blur transition-colors duration-[var(--dur-fast)] hover:border-[var(--border)]"
            >
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-subtle)]">
                {item.label}
              </dt>
              <dd className="mt-1.5 text-sm text-[var(--foreground)]">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}

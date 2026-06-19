import { ChatInterface } from '@/components/ChatInterface';
import { requireSession } from '@/lib/auth/session';

export default async function ChatPage() {
  // requireSession() is the auth guard — it throws/redirects when
  // the user is signed out, so we still need to call it even though
  // the page itself no longer reads the returned session.
  await requireSession();
  return (
    // The page column is a full-height flex column. The chat card
    // below uses `flex-1` to take the remaining viewport height —
    // not `h-full` — so on a short viewport the card can still
    // shrink to fit without the page itself scrolling, and on a
    // tall viewport it caps naturally at the viewport.
    <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex shrink-0 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)]/70 px-2.5 py-0.5 text-[11px] font-medium text-[var(--foreground-muted)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            </span>
            Online
          </span>
          <span className="text-[11px] font-medium text-[var(--foreground-subtle)]">
            Citations on · 30 messages / min
          </span>
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-[1.7rem]">
          Support Chat
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
          Ask a question and we&apos;ll answer from the school&apos;s
          documentation, with the source highlighted for every reply.
        </p>
      </header>

      <ChatInterface />
    </div>
  );
}

import { ChatInterface } from '@/components/ChatInterface';
import { requireSession } from '@/lib/auth/session';

export default async function ChatPage() {
  // requireSession() is the auth guard — it throws/redirects when
  // the user is signed out, so we still need to call it even though
  // the page itself no longer reads the returned session.
  await requireSession();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Support Chat</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask a question and we&apos;ll answer from our documentation, with citations.
        </p>
      </header>
      <ChatInterface />
    </div>
  );
}

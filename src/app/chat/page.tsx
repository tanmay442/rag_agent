import { ChatInterface } from '@/components/ChatInterface';
import { requireSession } from '@/lib/auth/session';

export default async function ChatPage() {
  const session = await requireSession();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Support Chat</h1>
          <span
            className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            data-testid="chat-user-chip"
          >
            {session.user.name}
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask a question and we&apos;ll answer from our documentation, with citations.
        </p>
      </header>
      <ChatInterface />
    </div>
  );
}

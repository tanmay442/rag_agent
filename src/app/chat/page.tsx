import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import { ChatInterface } from '@/components/ChatInterface';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
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

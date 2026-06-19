import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';

export default async function Home() {
  const { userId } = await auth();
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <main className="flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-4xl font-semibold tracking-tight">
          Serverless AI Customer Support
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Ask questions about company documentation, get cited answers, and
          escalate to a human with one click.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/chat"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            data-testid="home-open-chat"
          >
            Open chat
          </Link>
          {!userId ? (
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                data-testid="home-sign-in"
              >
                Sign in
              </button>
            </SignInButton>
          ) : null}
        </div>
      </main>
    </div>
  );
}

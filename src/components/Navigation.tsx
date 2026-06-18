import Link from 'next/link';
import { getSession } from '@/lib/auth/server';
import { SignOutButton } from './SignOutButton';

export async function Navigation() {
  const session = await getSession();
  return (
    <nav className="flex w-full items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="text-lg font-semibold">
        RAG Support
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/chat" className="hover:underline">
          Chat
        </Link>
        {session?.user.role === 'admin' && (
          <Link href="/admin/upload" className="hover:underline">
            Admin
          </Link>
        )}
        {session ? (
          <div className="flex items-center gap-3">
            <span className="text-zinc-600 dark:text-zinc-400">
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="hover:underline">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

import Link from 'next/link';

export function Navigation() {
  return (
    <nav className="flex w-full items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="text-lg font-semibold">
        RAG Support
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/chat" className="hover:underline">
          Chat
        </Link>
        <Link href="/admin/upload" className="hover:underline">
          Admin
        </Link>
      </div>
    </nav>
  );
}

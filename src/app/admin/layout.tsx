import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { requireAdmin } from '@/lib/auth/session';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/upload', label: 'Upload' },
  { href: '/admin/documents', label: 'Documents' },
  { href: '/admin/tickets', label: 'Tickets' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/audit', label: 'Audit log' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:flex-row">
      <aside className="flex w-full flex-col gap-1 md:w-56">
        <h1 className="mb-2 text-2xl font-semibold">Admin</h1>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              data-testid={`admin-nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-2 border-t pt-4">
          <UserButton />
          <span className="text-xs text-zinc-500">
            {session.user.name}
          </span>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}

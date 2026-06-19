import Link from 'next/link';
import { listUsers } from '@/lib/auth/users';
import { UserRowActions } from './user-row-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? '';
  const page = Math.max(1, Number(params.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  const result = await listUsers({
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">Users</h2>
      <form className="flex gap-2" method="get">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search name or email…"
          className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="users-search"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm" data-testid="users-table">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-zinc-500"
                >
                  No users.
                </td>
              </tr>
            ) : (
              result.users.map((u) => (
                <tr
                  key={u.clerkUserId}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                  data-testid={`users-row-${u.clerkUserId}`}
                >
                  <td className="px-3 py-2 font-medium">
                    {u.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{u.email}</td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        u.role === 'admin'
                          ? 'rounded bg-purple-100 px-2 py-0.5 text-purple-800'
                          : 'rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {u.lastSeenAt
                      ? u.lastSeenAt.toISOString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {u.createdAt.toISOString()}
                  </td>
                  <td className="px-3 py-2">
                    <UserRowActions
                      clerkUserId={u.clerkUserId}
                      role={u.role as 'admin' | 'user'}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>
          Page {page} of {totalPages} ({result.total} total)
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={{
                pathname: '/admin/users',
                query: { search, page: page - 1 },
              }}
              className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={{
                pathname: '/admin/users',
                query: { search, page: page + 1 },
              }}
              className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

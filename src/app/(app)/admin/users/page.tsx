import { getComposition, parsePageParam } from '@/composition';
import { UserRowActions } from './user-row-actions';
import { Pagination } from '@/components/admin/Pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? '';
  const page = parsePageParam(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const result = await getComposition().listUsers({
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">Users</h2>
      <form className="flex gap-2" method="get" aria-label="Search users">
        <label className="sr-only" htmlFor="users-search">
          Search users
        </label>
        <input
          id="users-search"
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search name or email…"
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]"
          data-testid="users-search"
        />
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          Search
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm" data-testid="users-table" aria-label="Users">
          <thead className="bg-[var(--surface-elevated)] text-left text-xs uppercase text-[var(--foreground-muted)]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Last seen</th>
              <th className="px-3 py-2 text-right">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-[var(--foreground-muted)]"
                >
                  No users.
                </td>
              </tr>
            ) : (
              result.users.map((u) => (
                <tr
                  key={u.clerkUserId}
                  className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)]/40"
                  data-testid={`users-row-${u.clerkUserId}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">
                    {u.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--foreground-muted)]">
                    {u.email}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u.role === 'admin' ? (
                      <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)]">
                        admin
                      </span>
                    ) : (
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[var(--foreground-muted)]">
                        user
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-[var(--foreground-muted)]">
                    {u.lastSeenAt
                      ? u.lastSeenAt.toISOString()
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-[var(--foreground-muted)]">
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
      <Pagination
        page={page}
        totalPages={totalPages}
        total={result.total}
        pathname="/admin/users"
        query={{ search }}
      />
    </section>
  );
}

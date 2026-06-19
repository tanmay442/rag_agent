import Link from 'next/link';
import { listTickets, TICKET_STATUSES } from '@/lib/admin/tickets';
import { listUsers } from '@/lib/auth/users';
import { TicketDrawer } from './ticket-drawer';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    assignee?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const status = TICKET_STATUSES.find((s) => s === params.status);
  const assignee = params.assignee?.trim() || undefined;
  const search = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  const [result, userList] = await Promise.all([
    listTickets({
      status: status ?? undefined,
      assignee: assignee === undefined ? undefined : assignee,
      search,
      limit: PAGE_SIZE,
      offset,
    }),
    listUsers({ limit: 100 }),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">Tickets</h2>
      <form
        className="grid grid-cols-1 gap-2 sm:grid-cols-4"
        method="get"
      >
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="tickets-filter-status"
        >
          <option value="">All statuses</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="assignee"
          defaultValue={assignee ?? ''}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="tickets-filter-assignee"
        >
          <option value="">Any assignee</option>
          {userList.users.map((u) => (
            <option key={u.clerkUserId} value={u.clerkUserId}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search issue…"
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="tickets-search"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Apply
        </button>
      </form>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm" data-testid="tickets-table">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Ticket</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Issue</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {result.tickets.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-zinc-500"
                >
                  No tickets.
                </td>
              </tr>
            ) : (
              result.tickets.map((t) => (
                <tr
                  key={t.ticketId}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                  data-testid={`tickets-row-${t.ticketId}`}
                >
                  <td className="px-3 py-2 font-medium">
                    <details data-testid={`tickets-drawer-${t.ticketId}`}>
                      <summary className="cursor-pointer text-blue-600 hover:underline">
                        {t.ticketId}
                      </summary>
                      <TicketDrawer
                        ticketId={t.ticketId}
                        name={t.name}
                        email={t.email}
                        issue={t.issue}
                        status={t.status}
                        assignedTo={t.assignedTo}
                        notes={t.notes}
                        userOptions={userList.users}
                      />
                    </details>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>{t.name}</span>
                      <span className="text-xs text-zinc-500">
                        {t.email}
                      </span>
                      {t.userId === 'anonymous' ? (
                        <span className="mt-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                          (anonymous)
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-xs">
                    {t.issue}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {t.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.assignedTo ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {t.createdAt.toISOString()}
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
                pathname: '/admin/tickets',
                query: { status, assignee, q: search, page: page - 1 },
              }}
              className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={{
                pathname: '/admin/tickets',
                query: { status, assignee, q: search, page: page + 1 },
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

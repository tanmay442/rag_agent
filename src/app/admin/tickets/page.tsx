import Link from 'next/link';
import { listTickets, TICKET_STATUSES } from '@/lib/admin/tickets';
import { listUsers } from '@/lib/auth/users';
import { TicketOverlay, type TicketRow } from './ticket-overlay';

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
  // Build a clerkUserId -> { name, email } index for display. Tickets
  // raised before the chat tool started overriding the LLM-provided
  // identity still have placeholder values like 'user@example.com';
  // falling back to the userList join cleans those rows up at render
  // time without touching the database.
  const userByClerkId = new Map<
    string,
    { name: string | null; email: string }
  >();
  for (const u of userList.users) {
    userByClerkId.set(u.clerkUserId, {
      name: u.name,
      email: u.email,
    });
  }
  const isPlaceholderEmail = (e: string) =>
    e === '' || e === 'user@example.com' || e.endsWith('@example.com');
  const rows: TicketRow[] = result.tickets.map((t) => ({
    ticketId: t.ticketId,
    userId: t.userId,
    name: t.name,
    email: t.email,
    issue: t.issue,
    status: t.status,
    assignedTo: t.assignedTo,
    notes: t.notes,
  }));
  return (
    <section className="flex flex-col gap-4">
      <TicketOverlay tickets={rows} userOptions={userList.users} />
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
              <th className="px-3 py-2 text-right">Created</th>
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
                    <Link
                      href={{
                        pathname: '/admin/tickets',
                        query: { ...params, ticket: t.ticketId },
                      }}
                      className="text-blue-600 hover:underline"
                      data-testid={`tickets-open-${t.ticketId}`}
                    >
                      {t.ticketId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>
                        {(() => {
                          // If the stored name looks like a placeholder
                          // (e.g. 'User' from the LLM-fabricated row) and
                          // the user is a Clerk id that exists in the
                          // local users table, fall back to that row.
                          const looksLikeClerkId = t.userId.startsWith('user_');
                          const nameLooksPlaceholder =
                            !t.name || t.name === 'User' || t.name === 'Unknown';
                          if (
                            looksLikeClerkId &&
                            nameLooksPlaceholder &&
                            userByClerkId.has(t.userId)
                          ) {
                            return (
                              userByClerkId.get(t.userId)?.name ??
                              t.name
                            );
                          }
                          return t.name;
                        })()}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {(() => {
                          const looksLikeClerkId = t.userId.startsWith('user_');
                          if (
                            looksLikeClerkId &&
                            isPlaceholderEmail(t.email) &&
                            userByClerkId.has(t.userId)
                          ) {
                            return userByClerkId.get(t.userId)?.email ?? t.email;
                          }
                          return t.email;
                        })()}
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
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {t.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.assignedTo ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-zinc-500">
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

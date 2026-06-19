import Link from 'next/link';
import { listAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string; ticketId?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  const documentId = params.documentId ? Number(params.documentId) : undefined;
  const ticketId = params.ticketId;
  const result = await listAudit({
    documentId: Number.isFinite(documentId) ? documentId : undefined,
    ticketId,
    limit: PAGE_SIZE,
    offset,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">Audit log</h2>
      <form className="flex flex-wrap gap-2" method="get">
        <input
          type="number"
          name="documentId"
          defaultValue={documentId ?? ''}
          placeholder="Document id"
          className="w-32 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]"
        />
        <input
          type="text"
          name="ticketId"
          defaultValue={ticketId ?? ''}
          placeholder="Ticket id (TKT-1001)"
          className="w-48 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]"
        />
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          Filter
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead className="bg-[var(--surface-elevated)] text-left text-xs uppercase text-[var(--foreground-muted)]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Actor</th>
            </tr>
          </thead>
          <tbody>
            {result.events.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-4 text-center text-[var(--foreground-muted)]"
                >
                  No audit events.
                </td>
              </tr>
            ) : (
              result.events.map((e) => (
                <tr
                  key={`${e.kind}-${e.id}`}
                  className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)]/40"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--foreground-muted)]">
                    {e.at.toISOString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--foreground)]">
                    {e.kind}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium text-[var(--foreground)]">
                    {e.action}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--foreground-muted)]">
                    {e.kind === 'document'
                      ? `document #${e.documentId}`
                      : e.ticketId}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--foreground-muted)]">
                    {e.actorName ?? e.actorId}
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
                pathname: '/admin/audit',
                query: { documentId, ticketId, page: page - 1 },
              }}
              className="rounded-xl border border-[var(--border)] px-3 py-1 text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={{
                pathname: '/admin/audit',
                query: { documentId, ticketId, page: page + 1 },
              }}
              className="rounded-xl border border-[var(--border)] px-3 py-1 text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

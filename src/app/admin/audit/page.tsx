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
          className="w-32 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="ticketId"
          defaultValue={ticketId ?? ''}
          placeholder="Ticket id (TKT-1001)"
          className="w-48 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filter
        </button>
      </form>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
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
                  className="px-3 py-4 text-center text-zinc-500"
                >
                  No audit events.
                </td>
              </tr>
            ) : (
              result.events.map((e) => (
                <tr
                  key={`${e.kind}-${e.id}`}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {e.at.toISOString()}
                  </td>
                  <td className="px-3 py-2 text-xs">{e.kind}</td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {e.action}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.kind === 'document'
                      ? `document #${e.documentId}`
                      : e.ticketId}
                  </td>
                  <td className="px-3 py-2 text-xs">
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
      </div>
    </section>
  );
}

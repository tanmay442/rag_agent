import { getAnalyticsSummary } from '@/lib/admin/analytics';
import { listAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const summary = await getAnalyticsSummary();
  const audit = await listAudit({ limit: 20 });
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-medium">Analytics</h2>
      <p className="text-xs text-zinc-500">
        The &quot;top queries&quot; counter is in-process; values reset on cold
        start and only count queries made since the most recent deploy.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Documents" value={summary.documentCount} />
        <Stat label="Chunks" value={summary.chunkCount} />
        <Stat label="Tickets" value={summary.ticketCount} />
        <Stat label="Open tickets" value={summary.openTicketCount} />
        <Stat label="Users" value={summary.usersCount} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">Top queries</h3>
        {summary.topQueries.length === 0 ? (
          <p className="text-sm text-zinc-500">No queries yet.</p>
        ) : (
          <table
            className="w-full text-sm"
            data-testid="analytics-top-queries"
          >
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Query</th>
                <th className="px-3 py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {summary.topQueries.map((q) => (
                <tr
                  key={q.q}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-2">{q.q}</td>
                  <td className="px-3 py-2">{q.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">Recent activity</h3>
        {audit.events.length === 0 ? (
          <p className="text-sm text-zinc-500">No audit events yet.</p>
        ) : (
          <ul
            className="flex flex-col gap-1 rounded border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            data-testid="analytics-recent-activity"
          >
            {audit.events.map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className="flex flex-wrap gap-2"
              >
                <span className="text-xs text-zinc-500">
                  {e.at.toISOString()}
                </span>
                <span className="font-medium">{e.action}</span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {e.kind === 'document'
                    ? `document #${e.documentId}`
                    : `ticket ${e.ticketId}`}
                </span>
                <span className="text-zinc-500">
                  by {e.actorName ?? e.actorId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  );
}

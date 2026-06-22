import { getComposition } from '@/composition';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const comp = getComposition();
  const summary = await comp.getAnalyticsSummary();
  const audit = await comp.listAudit({ limit: 20 });
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-medium">Analytics</h2>
      <p className="text-xs text-[var(--foreground-muted)]">
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
          <p className="text-sm text-[var(--foreground-muted)]">No queries yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table
              className="w-full text-sm"
              data-testid="analytics-top-queries"
            >
              <thead className="bg-[var(--surface-elevated)] text-left text-xs uppercase text-[var(--foreground-muted)]">
                <tr>
                  <th className="px-3 py-2">Query</th>
                  <th className="px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {summary.topQueries.map((q) => (
                  <tr
                    key={q.q}
                    className="border-t border-[var(--border-subtle)]"
                  >
                    <td className="px-3 py-2 text-[var(--foreground)]">{q.q}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-[var(--foreground-muted)]">
                      {q.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">Recent activity</h3>
        {audit.events.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">No audit events yet.</p>
        ) : (
          <ul
            className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
            data-testid="analytics-recent-activity"
          >
            {audit.events.map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className="flex flex-wrap gap-2"
              >
                <span className="text-xs text-[var(--foreground-muted)]">
                  {e.at.toISOString()}
                </span>
                <span className="font-medium">{e.action}</span>
                <span className="text-[var(--foreground-muted)]">
                  {e.kind === 'document'
                    ? `document #${e.documentId}`
                    : `ticket ${e.ticketId}`}
                </span>
                <span className="text-[var(--foreground-muted)]">
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
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
        {label}
      </span>
      <span className="text-2xl font-semibold text-[var(--foreground)]">
        {value}
      </span>
    </div>
  );
}

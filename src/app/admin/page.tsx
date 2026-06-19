import Link from 'next/link';
import { getAnalyticsSummary } from '@/lib/admin/analytics';
import { listAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const summary = await getAnalyticsSummary();
  const audit = await listAudit({ limit: 10 });
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-medium">Overview</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          href="/admin/documents"
          label="Documents"
          value={summary.documentCount}
          testId="admin-card-documents"
        />
        <Card
          href="/admin/documents"
          label="Chunks"
          value={summary.chunkCount}
          testId="admin-card-chunks"
        />
        <Card
          href="/admin/tickets"
          label="Tickets"
          value={summary.ticketCount}
          testId="admin-card-tickets"
        />
        <Card
          href="/admin/tickets"
          label="Open tickets"
          value={summary.openTicketCount}
          testId="admin-card-open-tickets"
        />
        <Card
          href="/admin/users"
          label="Users"
          value={summary.usersCount}
          testId="admin-card-users"
        />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">Latest audit events</h3>
        {audit.events.length === 0 ? (
          <p className="text-sm text-zinc-500">No audit events yet.</p>
        ) : (
          <ul
            className="flex flex-col gap-1 rounded border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            data-testid="admin-latest-audit"
          >
            {audit.events.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="flex gap-2">
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

function Card({
  href,
  label,
  value,
  testId,
}: {
  href: string;
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded border border-zinc-200 bg-white p-4 transition hover:border-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
      data-testid={testId}
    >
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
    </Link>
  );
}

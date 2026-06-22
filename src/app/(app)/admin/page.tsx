import Link from 'next/link';
import { getComposition } from '@/composition';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const comp = getComposition();
  const summary = await comp.getAnalyticsSummary();
  const audit = await comp.listAudit({ limit: 10 });
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
          <p className="text-sm text-[var(--foreground-muted)]">No audit events yet.</p>
        ) : (
          <ul
            className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
            data-testid="admin-latest-audit"
          >
            {audit.events.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="flex flex-wrap gap-2">
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
      className="group flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)]/60 hover:bg-[var(--surface-elevated)] hover:shadow-lg"
      data-testid={testId}
    >
      <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
        {label}
      </span>
      <span className="text-2xl font-semibold text-[var(--foreground)]">
        {value}
      </span>
    </Link>
  );
}

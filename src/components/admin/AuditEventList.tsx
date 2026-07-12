import { Card } from '@/components/ui/card';
import { FileText, Inbox } from 'lucide-react';
import { formatRelative } from '@/lib/format';

interface AuditEvent {
  kind: string;
  id: number;
  at: Date;
  action: string;
  documentId: number | null;
  ticketId: string | null;
  actorName: string | null;
  actorId: string;
}

interface AuditEventListProps {
  events: AuditEvent[];
  testId: string;
}

export function AuditEventList({ events, testId }: AuditEventListProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit events yet.</p>;
  }
  return (
    <Card className="gap-0 p-2 shadow-none" data-testid={testId}>
      <ul className="flex flex-col">
        {events.map((e, i) => {
          const isLast = i === events.length - 1;
          const Icon = e.kind === 'document' ? FileText : Inbox;
          const target =
            e.kind === 'document' ? `document #${e.documentId}` : `ticket ${e.ticketId}`;
          return (
            <li key={`${e.kind}-${e.id}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-secondary text-foreground-subtle">
                  <Icon className="size-3" aria-hidden />
                </span>
                {!isLast ? <span className="w-px flex-1 bg-border-subtle" /> : null}
              </div>
              <div className="flex flex-1 flex-col gap-0.5 pb-3 pt-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-medium text-foreground">{e.action}</span>
                  <span className="text-muted-foreground">{target}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>by {e.actorName ?? e.actorId}</span>
                  <span title={e.at.toISOString()}>{formatRelative(e.at)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
